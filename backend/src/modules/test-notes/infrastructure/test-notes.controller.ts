import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TEST_NOTES_REPO } from '../../../common/tokens.js';
import { isEstado, parseCreate, parsePatch } from '../domain/test-note.js';
import type { TestNotesRepo } from './test-notes.repo.js';

const INT4_MAX = 2_147_483_647;

/** Id de ruta: entero positivo que entra en INTEGER; si no, `null` (→ 400). */
function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= INT4_MAX ? n : null;
}

/**
 * /api/test-notes — notas de prueba (solo con TEST_NOTES_ENABLED=1; ver AppModule).
 * Protegido por el ClerkAuthGuard global. Notas compartidas entre cuentas (P1).
 */
@Controller('api/test-notes')
export class TestNotesController {
  constructor(@Inject(TEST_NOTES_REPO) private readonly repo: TestNotesRepo) {}

  private handleRepoError(err: unknown, res: Response): { error: string } {
    const e = err as Error & { statusCode?: number };
    if (e.statusCode === 404 || e.statusCode === 400) {
      res.status(e.statusCode);
      return { error: e.message };
    }
    throw err;
  }

  @Get()
  list(@Query('estado') estado?: unknown, @Query('ruta') ruta?: unknown) {
    return this.repo.list({
      // estado inválido se ignora (A3)
      estado: isEstado(estado) ? estado : undefined,
      ruta: typeof ruta === 'string' && ruta.trim() ? ruta.trim() : undefined,
    });
  }

  @Post()
  async create(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const parsed = parseCreate(body);
    if (!parsed.ok) {
      res.status(400);
      return { error: parsed.error };
    }
    res.status(201);
    return this.repo.create(parsed.value);
  }

  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = parseId(rawId);
    if (id === null) {
      res.status(400);
      return { error: 'Id inválido' };
    }
    const parsed = parsePatch(body);
    if (!parsed.ok) {
      res.status(400);
      return { error: parsed.error };
    }
    try {
      return await this.repo.update(id, parsed.value);
    } catch (err) {
      return this.handleRepoError(err, res);
    }
  }

  @Delete(':id')
  async remove(@Param('id') rawId: string, @Res({ passthrough: true }) res: Response) {
    const id = parseId(rawId);
    if (id === null) {
      res.status(400);
      return { error: 'Id inválido' };
    }
    try {
      return await this.repo.remove(id);
    } catch (err) {
      return this.handleRepoError(err, res);
    }
  }
}
