// Должен идти раньше любого другого импорта: AppModule (и через него
// AuthModule) читает process.env.JWT_SECRET прямо в момент импорта
// (JwtModule.register вызывается при вычислении @Module-декоратора),
// а не внутри bootstrap() — если .env загрузить позже, значение ещё не
// попадёт в process.env к этому моменту. Раньше .env вообще нигде не
// загружался приложением (только Prisma CLI грузит его для миграций),
// из-за чего проверка JWT-секрета ниже могла бы падать даже при
// правильно заполненном apps/api/.env (найдено при устранении
// security-review находки про fallback-секрет).
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`КЕРН API запущен на http://localhost:${port}`);
}

bootstrap();
