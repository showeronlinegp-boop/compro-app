import type { PrismaClient } from '@prisma/client';
import type { RegionIds, StoreMap } from '../../../shared/types.js';
import type { UserProfile, UserProfileInput } from '../domain/profile.js';

export interface ProfileRepo {
  get(): Promise<UserProfile | null>;
  upsert(data: UserProfileInput): Promise<UserProfile>;
  /**
   * Persist the user's location: postal code, selected store per super, and the
   * derived per-super regionIds. Requires an existing profile row.
   */
  setLocation(
    locationName: string | null,
    regionIds: RegionIds,
    stores: StoreMap,
  ): Promise<UserProfile | null>;
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
  postal_code: string | null;
  region_ids: unknown;
  stores: unknown;
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
    postal_code: row.postal_code,
    region_ids: (row.region_ids as UserProfile['region_ids']) ?? null,
    stores: (row.stores as UserProfile['stores']) ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * Per-user profile: each user has at most one user_profiles row, keyed by user_id (unique).
 * upsert is implemented via prisma.user_profiles.upsert({ where: { user_id }, ... })
 * using the unique user_id constraint added in the multi-tenancy migration.
 */
/**
 * makeProfileRepo accepts either a plain number or a getter function for userId.
 * Pass a getter from request-scoped module factories to defer resolution until
 * method execution (after guards have populated request.auth).
 */
export function makeProfileRepo(prisma: PrismaLike, userId: number | (() => number)): ProfileRepo {
  const uid = () => (typeof userId === 'function' ? userId() : userId);
  return {
    async get() {
      const row = await prisma.user_profiles.findUnique({ where: { user_id: uid() } });
      return row ? parseProfile(row) : null;
    },

    async upsert(data) {
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

      const row = await prisma.user_profiles.upsert({
        where: { user_id: uid() },
        create: { ...payload, user_id: uid() },
        update: payload,
      });

      return parseProfile(row);
    },

    async setLocation(locationName, regionIds, stores) {
      const existing = await prisma.user_profiles.findUnique({ where: { user_id: uid() } });
      if (!existing) return null;
      const row = await prisma.user_profiles.update({
        where: { user_id: uid() },
        data: {
          postal_code: locationName,
          region_ids: regionIds as object,
          stores: stores as object,
          updated_at: new Date(),
        },
      });
      return parseProfile(row);
    },

    async clear() {
      // Only clears the current user's profile row.
      await prisma.user_profiles.deleteMany({ where: { user_id: uid() } });
    },
  };
}
