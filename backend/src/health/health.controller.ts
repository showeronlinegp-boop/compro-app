import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth/public.decorator.js';

// Healthcheck del contenedor: no depende de ningún módulo opcional (antes
// usaba /api/sync/status, que no existe sin el comparador).
@Controller('api/health')
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}
