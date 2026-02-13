import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type Intent = 'flight_status' | 'departures' | 'arrivals' | 'greeting' | 'unknown';
type IntentResult = { intent: Intent; flightCode: string | null };

@Injectable()
export class AiService {
  constructor(private httpService: HttpService) {}

  async parseUserIntent(message: string): Promise<IntentResult> {
    const text = (message || '').trim();
    const lower = text.toLowerCase();

    // ✅ 1) Hard rules (always correct)
    const flightMatch = text.match(/\b([A-Za-z]{2}\d{3,5})\b/);
    if (flightMatch) {
      return { intent: 'flight_status', flightCode: flightMatch[1].toUpperCase() };
    }

    // arrivals keywords
    if (/\b(arrival|arrivals|inbound|landing)\b/.test(lower)) {
      return { intent: 'arrivals', flightCode: null };
    }

    // departures keywords
    if (/\b(departure|departures|outbound|takeoff|boarding)\b/.test(lower)) {
      return { intent: 'departures', flightCode: null };
    }

    // greetings
    if (/^(hi|hello|hey|ciao|salve|good morning|good afternoon|good evening)\b/.test(lower)) {
      return { intent: 'greeting', flightCode: null };
    }

    // ✅ 2) Only now call the LLM (for typos like "arrivls", "depatures", "ek 509", etc.)
    const schema = {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['flight_status', 'departures', 'arrivals', 'greeting', 'unknown'] },
        flightCode: { type: ['string', 'null'] },
      },
      required: ['intent', 'flightCode'],
      additionalProperties: false,
    };

    const prompt = `
Classify the user's intent for an airport WhatsApp bot.

User message: "${text}"

Return ONLY JSON matching the schema.
If uncertain, intent="unknown".
`.trim();

    try {
      const resp = await firstValueFrom(
        this.httpService.post('http://localhost:11434/api/generate', {
          model: 'tinyllama',
          prompt,
          stream: false,
          format: schema, // structured outputs
          options: { temperature: 0, num_predict: 120 },
        }),
      );

      const raw = String(resp.data.response || '').trim();
      console.log('🤖 Raw Ollama:', raw);

      const parsed = JSON.parse(raw);

      return {
        intent: (parsed.intent as Intent) ?? 'unknown',
        flightCode: parsed.flightCode ? String(parsed.flightCode).replace(/[^A-Z0-9]/gi, '').toUpperCase() : null,
      };
    } catch (e: any) {
      console.error('❌ Ollama failed:', e?.message);
      return { intent: 'unknown', flightCode: null };
    }
  }
}
