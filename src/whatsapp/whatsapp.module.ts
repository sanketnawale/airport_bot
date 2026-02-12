import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { FlightsModule } from '../flights/flights.module';  
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [FlightsModule, AiModule],  // ← THIS IMPORTS FlightsService and AiService
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
