import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import helmet from 'helmet';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { CORS_ORIGIN } from './config/env.js';
import { PORT } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Security headers — CSP disabled initially to avoid breaking the static SPA
  // bundle (script-src, style-src hashes not yet configured). Tighten in a
  // follow-up once a proper nonce/hash CSP policy is established.
  // TODO: enable contentSecurityPolicy once SPA asset hashes are pinned.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Body size limits — owned payloads are tiny; 100 KB prevents large-payload DoS.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // CORS: scoped to the declared origin(s); fails closed — no wildcard allowed.
  // CORS_ORIGIN is comma-separated in env to support local + staging together.
  const corsOrigins = CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });

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
