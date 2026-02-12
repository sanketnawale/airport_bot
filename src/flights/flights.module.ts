import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FlightsService } from './flights.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [FlightsService],
  exports: [FlightsService],
})
export class FlightsModule {}
