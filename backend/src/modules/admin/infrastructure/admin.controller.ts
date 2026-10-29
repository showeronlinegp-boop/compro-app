import { Controller, Get, HttpException, Inject, Logger, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../../../common/auth/admin.guard.js';
import { CLERK_INGRESOS, USO_REPO } from '../../../common/tokens.js';
import { fechaAR } from '../../fiado/domain/fiado.js';
import { type Ingreso, armarReporte, parseSemanas, primeraSemana } from '../domain/uso.js';
import type { ClerkIngresos } from './clerk-ingresos.js';
import type { UsoRepo } from './uso.repo.js';

/**
 * Panel de uso: cómo usan la app los comercios. Sólo admins (AdminGuard) y
 * sólo agregados por comercio: nunca datos de los clientes de cada libreta.
 */
@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    @Inject(USO_REPO) private readonly repo: UsoRepo,
    @Inject(CLERK_INGRESOS) private readonly clerkIngresos: ClerkIngresos,
  ) {}

  @Get('uso')
  @Throttle({ global: { ttl: 60_000, limit: 20 } })
  async uso(@Query('semanas') rawSemanas?: string) {
    const semanas = parseSemanas(rawSemanas);
    if (semanas === null) throw new HttpException('semanas inválido (1 a 52)', 400);
    const ahora = new Date();
    const [comercios, actividad] = await Promise.all([
      this.repo.comercios(),
      this.repo.actividad(primeraSemana(fechaAR(ahora), semanas)),
    ]);
    return armarReporte(
      comercios,
      actividad,
      await this.ingresos(comercios.map((c) => c.clerk_user_id)),
      semanas,
      ahora,
    );
  }

  /** Si Clerk falla el panel sale igual, sin la columna de último ingreso. */
  private async ingresos(ids: string[]): Promise<Map<string, Ingreso> | null> {
    try {
      return await this.clerkIngresos(ids);
    } catch (err) {
      this.logger.warn(`Clerk no devolvió los ingresos: ${(err as Error).message}`);
      return null;
    }
  }
}
