import type { PrismaClient } from '@prisma/client';
import type { UserProfile, UserProfileInput } from '../domain/profile.js';

export interface ProfileRepo {
  get(): Promise<UserProfile | null>;
  upsert(data: UserProfileInput): Promise<UserProfile>;
  clear(): Promise<void>;
}

type PrismaLike = Pick<PrismaClient, 'user_profiles'>;

function parseProfile(row: {
  id: number;
  nombre: string;
  edad: number | null;
  genero: string | null;
  hogar_tamano: number;
  hogar_chicos: unknown;
  hogar_adultos_mayores: boolean;
  hogar_mascotas: unknown;
  tier_por_categoria: unknown;
  price_driven: unknown;
  perfil_hogar: string;
  nse_proxy: string | null;
  onboarding_done: boolean;
  created_at: Date;
  updated_at: Date;
}): UserProfile {
  return {
    id: row.id,
    nombre: row.nombre,
    edad: row.edad,
    genero: row.genero,
    hogar_tamano: row.hogar_tamano,
    hogar_chicos: (row.hogar_chicos as string[] | null) ?? null,
    hogar_adultos_mayores: row.hogar_adultos_mayores,
    hogar_mascotas: (row.hogar_mascotas as string[] | null) ?? null,
    tier_por_categoria: (row.tier_por_categoria as UserProfile['tier_por_categoria']) ?? {},
    price_driven: (row.price_driven as string[] | null) ?? null,
    perfil_hogar: row.perfil_hogar as UserProfile['perfil_hogar'],
    nse_proxy: row.nse_proxy,
    onboarding_done: row.onboarding_done,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * Single-user assumption: user_profiles holds exactly one row.
 * upsert is implemented as findFirst + create/update (not a native Prisma upsert)
 * because there is no unique business key to upsert on beyond the auto-increment id.
 * A race between two concurrent upsert calls could create a second row, but this
 * app has a single user with no concurrent writes to the profile, so the risk is
 * accepted. If multi-user support is ever added, add a unique constraint and
 * migrate to prisma.user_profiles.upsert().
 */
export function makeProfileRepo(prisma: PrismaLike): ProfileRepo {
  return {
    async get() {
      const row = await prisma.user_profiles.findFirst({ orderBy: { id: 'asc' } });
      return row ? parseProfile(row) : null;
    },

    async upsert(data) {
      const existing = await prisma.user_profiles.findFirst({ orderBy: { id: 'asc' } });

      const payload = {
        nombre: data.nombre,
        edad: data.edad ?? null,
        genero: data.genero ?? null,
        hogar_tamano: data.hogar_tamano,
        hogar_chicos: data.hogar_chicos as object,
        hogar_adultos_mayores: data.hogar_adultos_mayores,
        hogar_mascotas: data.hogar_mascotas as object,
        tier_por_categoria: data.tier_por_categoria as object,
        price_driven: data.price_driven as object,
        perfil_hogar: data.perfil_hogar,
        nse_proxy: data.nse_proxy,
        onboarding_done: data.onboarding_done ?? false,
        updated_at: new Date(),
      };

      const row = existing
        ? await prisma.user_profiles.update({ where: { id: existing.id }, data: payload })
        : await prisma.user_profiles.create({ data: payload });

      return parseProfile(row);
    },

    async clear() {
      await prisma.user_profiles.deleteMany({});
    },
  };
}
