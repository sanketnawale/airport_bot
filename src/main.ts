import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3001);  // ← CHANGED TO 3001
  console.log('🚀 Bot running on http://localhost:3001');
}
bootstrap();
