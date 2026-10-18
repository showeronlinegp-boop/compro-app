/**
 * test-notes.ts — CLI de notas de prueba (cambio test-notes, A7).
 *
 * Opera sobre las notas de TODAS las cuentas (son compartidas). Solo corre con
 * TEST_NOTES_ENABLED=1 (en backend/.env); en producción esa flag hace fallar
 * la carga de config/env.ts.
 *
 *   npm run notes -- lista
 *   npm run notes -- ver 12
 *   npm run notes -- estado 12 en_curso
 *   echo "Qué se cambió" | npm run notes -- responder 12 para_revisar
 *
 * `--json` imprime `{ notas }` / `{ nota }` (contrato estable para claude-link).
 * La respuesta de `responder` se lee de stdin para no pelear con comillas.
 * Errores: mensaje en stderr y código de salida 1.
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { TEST_NOTES_ADMIN_REPO } from '../src/common/tokens.js';
import { TEST_NOTES_APP_URL, TEST_NOTES_ENABLED } from '../src/config/env.js';
import {
  formatCambio,
  formatLista,
  formatVer,
  jsonLista,
  jsonNota,
  parseCliArgs,
} from '../src/modules/test-notes/domain/cli.js';
import { LIMITES } from '../src/modules/test-notes/domain/test-note.js';
import { TestNotesCliModule } from '../src/modules/test-notes/infrastructure/test-notes-cli.module.js';
import type { TestNotesAdminRepo } from '../src/modules/test-notes/infrastructure/test-notes.repo.js';

function leerStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c: string) => {
      data += c;
    });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  if (!TEST_NOTES_ENABLED) {
    throw new Error(
      'Las notas de prueba están apagadas: seteá TEST_NOTES_ENABLED=1 en backend/.env (solo desarrollo local)',
    );
  }

  const args = parseCliArgs(process.argv.slice(2));
  if ('error' in args) throw new Error(args.error);

  let respuesta: string | undefined;
  if (args.cmd === 'responder') {
    respuesta = (await leerStdin()).slice(0, LIMITES.respuesta);
    if (!respuesta) {
      throw new Error(
        'Pasá la respuesta por la entrada estándar: echo "..." | npm run notes -- responder <id> <estado>',
      );
    }
  }

  const app = await NestFactory.createApplicationContext(TestNotesCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const admin = app.get<TestNotesAdminRepo>(TEST_NOTES_ADMIN_REPO);

    if (args.cmd === 'lista') {
      const notas = await admin.listVivas();
      console.log(args.json ? jsonLista(notas) : formatLista(notas));
      return;
    }

    if (args.cmd === 'ver') {
      const nota = await admin.get(args.id);
      console.log(args.json ? jsonNota(nota) : formatVer(nota, TEST_NOTES_APP_URL));
      return;
    }

    await admin.setEstado(args.id, args.estado, respuesta);
    if (args.json) {
      console.log(jsonNota(await admin.get(args.id)));
    } else {
      console.log(formatCambio(args.id, args.estado, respuesta !== undefined));
    }
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
