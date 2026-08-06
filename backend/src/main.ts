import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  // Monorepo: sprites live at repo root (../sprites from backend/)
  app.useStaticAssets(join(process.cwd(), '..', 'sprites'), {
    prefix: '/sprites',
  });
  // Unit/effect SFX shared with battle-overlay (admin Test Unit preview)
  app.useStaticAssets(
    join(process.cwd(), '..', 'battle-overlay', 'public', 'audio'),
    { prefix: '/audio' },
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Nation Wars API listening on http://localhost:${port}`);
}
bootstrap();
