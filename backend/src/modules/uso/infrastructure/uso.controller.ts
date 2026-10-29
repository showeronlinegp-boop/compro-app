import { Body, Controller, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import { USO_EVENTOS_REPO } from '../../../common/tokens.js';
import { LoteInvalido, parseLote } from '../domain/evento.js';
import type { UsoEventosRepo } from './uso-eventos.repo.js';

/**
 * Registro de uso desde el front (requiere sesión, como todo). Responde 204:
 * el front no espera nada y no reintenta.
 */
@Controller('api/uso')
export class UsoController {
  constructor(@Inject(USO_EVENTOS_REPO) private readonly repo: UsoEventosRepo) {}

  @Post('eventos')
  @HttpCode(204)
  async eventos(@Body() body: unknown): Promise<void> {
    try {
      await this.repo.registrar(parseLote(body));
    } catch (err) {
      if (err instanceof LoteInvalido) throw new HttpException(err.message, 400);
      throw err;
    }
  }
}
