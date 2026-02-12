import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService {
  constructor(private httpService: HttpService) {}

  async parseUserIntent(message: string) {
    const prompt = `CLASSIFY this airport message:

"${message}"

JSON ONLY:
{"intent":"flight_status","flightCode":"EK509"}
{"intent":"departures"}
{"intent":"greeting"}

intents: flight_status,departures,arrivals,greeting,unknown`;


    try {
      const response = await firstValueFrom(
        this.httpService.post('http://localhost:11434/api/generate', {
          model: 'tinyllama',
          prompt,
          options: { temperature: 0.1 },
          stream: false,
        }),
      );
      
      let aiResponse = response.data.response.trim();
      
      // 🔧 Better JSON extraction
      aiResponse = aiResponse.replace(/^.*\{/, '{').replace(/\}.*$/, '}');
      aiResponse = aiResponse.replace(/```json|```|```/g, '');
      
      console.log('🤖 Raw Ollama:', aiResponse);
      
      const parsed = JSON.parse(aiResponse);
      console.log('✅ AI parsed:', parsed);
      
      return parsed;
    } catch (error) {
      console.error('❌ Ollama parse failed:', error.message);
      return { intent: 'unknown' };
    }
  }
}
