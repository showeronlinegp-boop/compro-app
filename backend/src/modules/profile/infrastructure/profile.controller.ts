import { Body, Controller, Delete, Get, Inject, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LIST_GEN_SERVICE, PROFILE_REPO } from '../../../common/tokens.js';
import { deriveProfile } from '../domain/profile.js';
import type { OnboardingAnswers } from '../../../shared/types.js';
import type { ProfileRepo } from './profile.repo.js';
import type { ListGeneratorService } from '../../list-generator/infrastructure/list-generator.service.js';

@Controller('api/profile')
export class ProfileController {
  constructor(
    @Inject(PROFILE_REPO) private readonly repo: ProfileRepo,
    @Inject(LIST_GEN_SERVICE) private readonly listGen: ListGeneratorService,
  ) {}

  @Get()
  get() {
    return this.repo.get();
  }

  @Put()
  async update(@Body() body: unknown) {
    const data = body as Parameters<ProfileRepo['upsert']>[0];
    if (!data?.nombre || !data?.hogar_tamano || !data?.tier_por_categoria || !data?.perfil_hogar) {
      throw Object.assign(new Error('Campos requeridos: nombre, hogar_tamano, tier_por_categoria, perfil_hogar'), { statusCode: 400 });
    }
    return this.repo.upsert(data);
  }

  @Post('onboarding')
  async onboarding(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const answers = body as OnboardingAnswers;

    if (!answers?.nombre || !answers?.hogar_tamano) {
      res.status(400);
      return { error: 'Campos requeridos: nombre, hogar_tamano' };
    }

    const derived = deriveProfile(answers);
    const profile = await this.repo.upsert(derived);
    const { generated } = await this.listGen.generateForProfile(profile);

    res.status(201);
    return { profile, generated };
  }

  @Post('generate-list')
  async generateList(@Res({ passthrough: true }) res: Response) {
    const profile = await this.repo.get();
    if (!profile) {
      res.status(404);
      return { error: 'No hay perfil configurado. Completá el onboarding primero.' };
    }
    const { generated } = await this.listGen.generateForProfile(profile);
    return { generated };
  }

  @Delete()
  async clear() {
    await this.repo.clear();
    return { ok: true };
  }
}
