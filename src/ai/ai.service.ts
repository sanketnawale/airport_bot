import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService {
  constructor(private httpService: HttpService) {}

  async parseUserIntent(message: string) {
    const prompt = `Message: "${message}"

    Return JSON:
    {"intent":"flight_status","flightCode":"EK509"}
    OR
    {"intent":"departures"}
    OR
    {"intent":"arrivals"}
    OR
    {"intent":"greeting"}

    Valid intents: flight_status, departures, arrivals, greeting, unknown
    JSON only:`;

    try {
        const response = await firstValueFrom(
        this.httpService.post('http://localhost:11434/api/generate', {
            model: 'tinyllama',
            prompt,
            options: { 
            temperature: 0.05,
            num_predict: 60,
            },
            stream: false,
        }),
        );
        
        let aiResponse = response.data.response.trim();
        
        // 🔥 Aggressive JSON extraction
        const jsonMatch = aiResponse.match(/\{[^}]*"intent"[^}]*\}/);
        if (jsonMatch) {
        aiResponse = jsonMatch[0];
        } else {
        // Fallback: look for ANY JSON
        const anyJson = aiResponse.match(/\{[^}]+\}/);
        if (anyJson) {
            aiResponse = anyJson[0];
        }
        }
        
        aiResponse = aiResponse.replace(/```json|```/g, '').trim();
        
        console.log('🤖 Raw Ollama:', aiResponse);
        
        const parsed = JSON.parse(aiResponse);
        
        // 🔥 Normalize output
        const result = {
        intent: parsed.intent || 'unknown',
        flightCode: parsed.flightCode?.replace(/[^A-Z0-9]/gi, '').toUpperCase() || null,
        airportCode: parsed.airportCode || null,
        };
        
        console.log('✅ AI parsed:', result);
        return result;
        
    } catch (error) {
        console.error('❌ Ollama failed:', error.message);
        return { intent: 'unknown', flightCode: null };
    }
    }

}
