import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../../common/auth/admin.guard.js';
import { TUTORIALES_REPO } from '../../../common/tokens.js';
import { TutorialInvalido, parseTutorial } from '../domain/tutorial.js';
import type { TutorialesRepo } from './tutoriales.repo.js';

/** Lista de tutoriales: la ve cualquier comercio con sesión (Ajustes → Tutoriales). */
@Controller('api/tutoriales')
export class TutorialesController {
  constructor(@Inject(TUTORIALES_REPO) private readonly repo: TutorialesRepo) {}

  @Get()
  listar() {
    return this.repo.listar();
  }
}

/** Cargar y borrar tutoriales: sólo admins, desde el panel. */
@Controller('api/admin/tutoriales')
@UseGuards(AdminGuard)
export class TutorialesAdminController {
  constructor(@Inject(TUTORIALES_REPO) private readonly repo: TutorialesRepo) {}

  @Post()
  async crear(@Body() body: unknown) {
    try {
      return await this.repo.crear(parseTutorial(body));
    } catch (err) {
      if (err instanceof TutorialInvalido) throw new HttpException(err.message, 400);
      throw err;
    }
  }

  @Delete(':id')
  @HttpCode(204)
  async borrar(@Param('id') rawId: string): Promise<void> {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) throw new HttpException('id inválido', 400);
    if (!(await this.repo.borrar(id))) throw new HttpException('No existe ese tutorial', 404);
  }
}
