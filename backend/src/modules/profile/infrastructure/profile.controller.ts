import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../../common/auth/public.decorator.js';
import { LIST_GEN_SERVICE, PROFILE_REPO } from '../../../common/tokens.js';
import { SUPERS } from '../../../config/supers.js';
import { geocodeAddress, geocodePostalCode, reverseGeocode } from '../../../infrastructure/geocode.js';
import { getStoresNear, regionIdForSellers } from '../../../infrastructure/vtex/stores-client.js';
import { resolveVeaRegion } from '../../../infrastructure/vtex/vea-region-client.js';
import type {
  OnboardingAnswers,
  RegionIds,
  StoreMap,
  SuperKey,
} from '../../../shared/types.js';
import type { ListGeneratorService } from '../../list-generator/infrastructure/list-generator.module.js';
import { deriveProfile } from '../domain/profile.js';
import type { ProfileRepo } from './profile.repo.js';

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
      throw new BadRequestException('Campos requeridos: nombre, hogar_tamano, tier_por_categoria, perfil_hogar');
    }
    return this.repo.upsert(data);
  }

  // Public: geocoding lookup only — no user data. Lets logged-out visitors pick
  // a zone (needed for browsing regional prices without an account).
  @Public()
  @Get('location/search')
  async searchLocations(@Query('q') q?: string) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('Query muy corta (mínimo 2 caracteres)');
    }
    return geocodeAddress(q.trim());
  }

  // Resolve coordinates or postal code to nearby physical stores per super (does NOT persist).
  // The frontend shows these so the user can confirm/change before saving.
  // Carrefour/DIA/MAS return stores; VEA returns [] (Cencosud exposes none).
  // Public: stateless resolution, no user data — usable before login.
  @Public()
  @Get('location/stores')
  async resolveStores(
    @Query('postal_code') postalCode?: string,
    @Query('lat') latStr?: string,
    @Query('lng') lngStr?: string,
  ) {
    let geo: { lat: number; lng: number };
    let location_name: string;

    const lat = Number(latStr);
    const lng = Number(lngStr);

    if (latStr !== undefined && lngStr !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
      geo = { lat, lng };
      const name = await reverseGeocode(geo).catch(() => null);
      location_name = name ?? `${lat.toFixed(4)},${lng.toFixed(4)}`;
    } else if (postalCode) {
      const digits = String(postalCode).replace(/\D/g, '');
      if (digits.length < 4) {
        throw new BadRequestException('Código postal inválido (mínimo 4 dígitos)');
      }
      const cp = digits.slice(0, 4);
      const resolved = await geocodePostalCode(cp);
      if (!resolved) {
        throw new BadRequestException(`No pudimos ubicar el código postal ${cp}`);
      }
      geo = resolved;
      location_name = cp;
    } else {
      throw new BadRequestException('Se requiere lat+lng o postal_code');
    }

    const keys = Object.keys(SUPERS) as SuperKey[];
    const lists = await Promise.all(keys.map((key) => getStoresNear(SUPERS[key].baseUrl, geo)));
    const supers: Partial<Record<SuperKey, unknown>> = {};
    keys.forEach((key, i) => {
      supers[key] = lists[i];
    });

    return { location_name, geo, supers };
  }

  // Persist the user's location. Resolves the zone's stores per super and
  // derives the regionId (base64("SW#"+all nearby store sellers)) the crawler
  // uses for region-accurate prices/stock. Pricing is zone-based (the set of
  // stores serving the area), so there is no single store to pick.
  @Put('location')
  async setLocation(@Body() body: unknown) {
    const b = body as { lat?: unknown; lng?: unknown; location_name?: unknown; postal_code?: unknown };

    let geo: { lat: number; lng: number };
    let locationName: string;

    const lat = Number(b?.lat);
    const lng = Number(b?.lng);

    if (b?.lat !== undefined && b?.lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
      geo = { lat, lng };
      const name = typeof b.location_name === 'string' && b.location_name.trim()
        ? b.location_name.trim()
        : await reverseGeocode(geo).catch(() => null);
      locationName = name ?? `${lat.toFixed(4)},${lng.toFixed(4)}`;
    } else if (b?.postal_code) {
      const digits = String(b.postal_code).replace(/\D/g, '');
      if (digits.length < 4) {
        throw new BadRequestException('Código postal inválido (mínimo 4 dígitos)');
      }
      const postalCode = digits.slice(0, 4);
      const resolved = await geocodePostalCode(postalCode);
      if (!resolved) {
        throw new BadRequestException(`No pudimos ubicar el código postal ${postalCode}`);
      }
      geo = resolved;
      locationName = postalCode;
    } else {
      throw new BadRequestException('Se requiere lat+lng o postal_code');
    }

    const keys = Object.keys(SUPERS) as SuperKey[];
    const lists = await Promise.all(keys.map((key) => getStoresNear(SUPERS[key].baseUrl, geo)));

    const stores: StoreMap = {};
    const regionIds: RegionIds = {};
    keys.forEach((key, i) => {
      const found = lists[i] ?? [];
      stores[key] = found.map((s) => ({
        sellerId: s.sellerId,
        name: s.name,
        city: s.city,
        state: s.state,
      }));
      regionIds[key] = regionIdForSellers(found.map((s) => s.sellerId));
    });

    // VEA/Cencosud exposes no VTEX pickup-points, so the loop above leaves it on
    // the default region. Resolve its zone seller via SEPA (nearest store) + the
    // /regions seller list so VEA crawls region-accurate like the other supers.
    if (!regionIds.vea) {
      const vea = await resolveVeaRegion(SUPERS.vea.baseUrl, geo);
      if (vea) {
        regionIds.vea = vea.regionId;
        stores.vea = [vea.store];
      }
    }

    const profile = await this.repo.setLocation(locationName, regionIds, stores);
    if (!profile) {
      throw new NotFoundException('No hay perfil configurado. Completá el onboarding primero.');
    }
    return profile;
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
