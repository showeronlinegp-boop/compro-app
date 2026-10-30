import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { FIADO_REPO } from '../../../common/tokens.js';
import {
  FiadoError,
  parseAjustesInput,
  parseClienteInput,
  parseClientePatch,
  parseMovimientoInput,
  parseOmitirRecargo,
  parseOrden,
  parseSumarRecargos,
  parseViaAviso,
} from '../domain/fiado.js';
import type { FiadoRepo } from './fiado.repo.js';

function parseId(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpException(`${label} inválido`, 400);
  return n;
}

/** Traduce los errores de dominio (400/404/409) a HttpException. */
async function run<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FiadoError) throw new HttpException(err.message, err.status);
    throw err;
  }
}

/**
 * API del módulo Fiado. Todas las rutas requieren sesión (guard global) y
 * operan sólo sobre los datos del usuario actual.
 *
 * El libro es append-only: no hay rutas para editar ni borrar movimientos.
 * "Deshacer" es `POST /movimientos/:id/correccion`.
 */
@Controller('api/fiado')
export class FiadoController {
  constructor(@Inject(FIADO_REPO) private readonly repo: FiadoRepo) {}

  @Get('resumen')
  resumen() {
    return run(() => this.repo.resumen());
  }

  /** Campanita: vencidos, vencen hoy y próximos días (nota de prueba #3). */
  @Get('avisos')
  avisos() {
    return run(() => this.repo.avisos());
  }

  @Get('clientes')
  listClientes(@Query('q') q?: string, @Query('orden') orden?: string) {
    return run(() => this.repo.listClientes(typeof q === 'string' ? q : '', parseOrden(orden)));
  }

  @Post('clientes')
  crearCliente(@Body() body: unknown) {
    return run(() => this.repo.crearCliente(parseClienteInput(body)));
  }

  @Get('clientes/:id')
  ficha(@Param('id') id: string) {
    return run(() => this.repo.ficha(parseId(id, 'id')));
  }

  @Patch('clientes/:id')
  actualizarCliente(@Param('id') id: string, @Body() body: unknown) {
    return run(() => this.repo.actualizarCliente(parseId(id, 'id'), parseClientePatch(body)));
  }

  @Post('clientes/:id/recordatorios')
  registrarRecordatorio(@Param('id') id: string) {
    return run(() => this.repo.registrarRecordatorio(parseId(id, 'id')));
  }

  /** "Sumar recargos": anota los sugeridos (todos o los de `fiado_ids`), uno por fiado. */
  @Post('clientes/:id/recargos')
  sumarRecargos(@Param('id') id: string, @Body() body: unknown) {
    return run(() => {
      const { fiado_ids, idempotency_key } = parseSumarRecargos(body);
      return this.repo.sumarRecargos(parseId(id, 'id'), fiado_ids, idempotency_key);
    });
  }

  /** "No cobrar": saltea el período sugerido de un fiado. Devuelve la ficha. */
  @Post('clientes/:id/recargos/omitir')
  @HttpCode(200)
  omitirRecargo(@Param('id') id: string, @Body() body: unknown) {
    return run(() => this.repo.omitirRecargo(parseId(id, 'id'), parseOmitirRecargo(body)));
  }

  /** El comercio le avisó las condiciones de recargo (WhatsApp o "Cambio informado"). */
  @Post('clientes/:id/aviso-recargo')
  registrarAvisoRecargo(@Param('id') id: string, @Body() body: unknown) {
    return run(() => this.repo.registrarAvisoRecargo(parseId(id, 'id'), parseViaAviso(body)));
  }

  @Post('movimientos')
  crearMovimiento(@Body() body: unknown) {
    return run(() => this.repo.crearMovimiento(parseMovimientoInput(body)));
  }

  @Post('movimientos/:id/correccion')
  @HttpCode(201)
  corregirMovimiento(@Param('id') id: string) {
    return run(() => this.repo.corregirMovimiento(parseId(id, 'id')));
  }

  @Get('ajustes')
  getAjustes() {
    return run(() => this.repo.getAjustes());
  }

  @Put('ajustes')
  putAjustes(@Body() body: unknown) {
    return run(() => this.repo.putAjustes(parseAjustesInput(body)));
  }
}
