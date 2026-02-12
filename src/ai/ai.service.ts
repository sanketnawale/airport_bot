import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService {
  constructor(private httpService: HttpService) {}

  async parseUserIntent(message: string) {
    const prompt = `Parse airport bot intent from: "${message}"

Return ONLY valid JSON:
{"intent":"flight_status|departures|arrivals|greeting|unknown","flightCode":"EK509?","airportCode":"FCO?"}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post('http://localhost:11434/api/generate', {
          model: 'tinyllama',
          prompt,
          options: { temperature: 0.1 },
          stream: false,
        }),
      );
      
      const aiResponse = response.data.response.trim();
      const cleaned = aiResponse.replace(/```json|```/g, '');
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Ollama error:', error.message);
      return { intent: 'unknown' };
    }
  }
}
