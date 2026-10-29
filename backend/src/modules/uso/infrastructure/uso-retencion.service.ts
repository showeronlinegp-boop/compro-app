import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
// biome-ignore lint/style/useImportType: NestJS emitDecoratorMetadata requires value import for DI
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DIAS_RETENCION } from '../domain/evento.js';
import { purgarEventosViejos } from './uso-eventos.repo.js';

/** Todos los días a las 5: borra los eventos de uso de más de DIAS_RETENCION días. */
@Injectable()
export class UsoRetencionService {
  private readonly logger = new Logger(UsoRetencionService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Cron('0 5 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async purgar(): Promise<void> {
    try {
      const borrados = await purgarEventosViejos(this.prisma);
      if (borrados > 0) {
        this.logger.log(`Borrados ${borrados} eventos de uso de más de ${DIAS_RETENCION} días`);
      }
    } catch (err) {
      this.logger.error(`No se pudieron borrar los eventos viejos: ${(err as Error).message}`);
    }
  }
}
