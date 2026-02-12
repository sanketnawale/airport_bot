import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Twilio posts x-www-form-urlencoded for incoming WhatsApp messages
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  await app.listen(3001);
  console.log('🚀 Bot running on http://localhost:3001');
}
bootstrap();
