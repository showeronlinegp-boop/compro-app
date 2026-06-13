import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { PORT } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Resolve static path relative to this file — works in BOTH layouts:
  //   tsx dev:  __dirname = backend/src  → ../../frontend/dist
  //   dist:     __dirname = backend/dist → ../../frontend/dist
  const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
  const clientDir = nodePath.join(__dirname, '..', '..', 'frontend', 'dist');

  app.useStaticAssets(clientDir);

  // SPA fallback: unmatched non-/api GETs return index.html for client-side routing
  app
    .getHttpAdapter()
    .getInstance()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .get(/^(?!\/api).*/, (_req: any, res: any) => {
      res.sendFile(nodePath.join(clientDir, 'index.html'));
    });

  await app.listen(PORT);
  console.log(`COMPRO backend running on http://localhost:${PORT}`);
}

bootstrap();
