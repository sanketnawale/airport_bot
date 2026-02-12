import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { FlightsModule } from './flights/flights.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), WhatsappModule, FlightsModule],
})
export class AppModule {}
