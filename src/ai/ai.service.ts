import { Injectable } from '@nestjs/common';
import { Ollama } from 'ollama';

@Injectable()
export class AiService {
  private ollama: Ollama;

  constructor() {
    this.ollama = new Ollama({ host: 'http://localhost:11434' });
  }

  async parseUserIntent(message: string) {
    const prompt = `Parse airport bot intent from: "${message}"

Return ONLY JSON:
{"intent":"flight_status|departures|arrivals|greeting|unknown","flightCode":"EK509?","airportCode":"FCO?"}`;

    try {
      const response = await this.ollama.generate({
        model: 'tinyllama',
        prompt,
        options: { temperature: 0.1 },
      });
      
      const cleaned = response.response.trim().replace(/```json|```/g, '');
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('AI parse error:', error);
      return { intent: 'unknown' };
    }
  }
}
