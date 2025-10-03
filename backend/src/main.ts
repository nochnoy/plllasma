import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Подключаем cookie-parser
  app.use(cookieParser());
  
  // Включаем CORS как в PHP бэкенде
  app.enableCors({
    origin: [
      'https://plllasma.ru',
      'https://plllasma.com', 
      'https://contortion.ru',
      'https://localhost',
      'http://localhost:4200'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Cache-Control', 'Pragma', 'Origin', 'Authorization', 'Content-Type', 'X-Requested-With', 'X-Auth-Token']
  });

  // Глобальная валидация
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
  }));

  // Устанавливаем глобальный префикс API
  app.setGlobalPrefix('api');

  await app.listen(3001);
  console.log('Backend server running on port 3001');
}
bootstrap();
