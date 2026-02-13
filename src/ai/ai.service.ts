import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type IntentResult = {
  intent: 'flight_status' | 'departures' | 'arrivals' | 'greeting' | 'unknown';
  flightCode: string | null;
};

@Injectable()
export class AiService {
  constructor(private httpService: HttpService) {}

  async parseUserIntent(message: string): Promise<IntentResult> {
    // ✅ JSON Schema enforced by Ollama structured outputs
    const schema = {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: ['flight_status', 'departures', 'arrivals', 'greeting', 'unknown'],
        },
        flightCode: { type: ['string', 'null'] },
      },
      required: ['intent', 'flightCode'],
      additionalProperties: false,
    };

    const prompt = `
You are an intent classifier for an airport WhatsApp bot.

User message: "${message}"

Rules:
- If user greets (hello/hi/hey) => intent="greeting", flightCode=null
- If user asks arrivals/arrival => intent="arrivals", flightCode=null
- If user asks departures/departure => intent="departures", flightCode=null
- If message contains a flight like EK509 / AZ1234 => intent="flight_status", flightCode="EK509"
- Otherwise => intent="unknown", flightCode=null

Return ONLY the JSON object.
`.trim();

    try {
      const response = await firstValueFrom(
        this.httpService.post('http://localhost:11434/api/generate', {
          model: 'tinyllama',
          prompt,
          stream: false,
          format: schema, // ✅ enforce schema output
          options: {
            temperature: 0,
            num_predict: 120, // avoid truncation
          },
        }),
      );

      const raw = String(response.data.response || '').trim();
      console.log('🤖 Raw Ollama:', raw);

      const parsed = JSON.parse(raw);

      return {
        intent: parsed.intent ?? 'unknown',
        flightCode: parsed.flightCode
          ? String(parsed.flightCode).replace(/[^A-Z0-9]/gi, '').toUpperCase()
          : null,
      };
    } catch (error: any) {
      console.error('❌ Ollama failed:', error?.message);
      return { intent: 'unknown', flightCode: null };
    }
  }
}
