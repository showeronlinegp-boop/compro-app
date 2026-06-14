import type { OnboardingAnswers, PerfilHogar, TierMap, TierValue, UserProfile } from '../../../shared/types.js';

export type { UserProfile, OnboardingAnswers, PerfilHogar, TierMap };

export interface UserProfileInput {
  nombre: string;
  edad?: number | null;
  genero?: string | null;
  hogar_tamano: number;
  hogar_chicos: string[];
  hogar_adultos_mayores: boolean;
  hogar_mascotas: string[];
  tier_por_categoria: TierMap;
  price_driven: string[];
  perfil_hogar: PerfilHogar;
  nse_proxy: string | null;
  onboarding_done?: boolean;
}

function toTierValue(raw: TierValue | 'price_driven'): TierValue {
  return raw === 'price_driven' ? 3 : raw;
}

function averageTier(a: TierValue, b: TierValue): TierValue {
  const avg = (a + b) / 2;
  return Math.round(avg) as TierValue;
}

function derivePerfilHogar(
  hogar_tamano: number,
  hogar_chicos: string[],
  hogar_adultos_mayores: boolean,
): PerfilHogar {
  if (hogar_tamano === 1) return 'joven_solo';
  if (hogar_adultos_mayores && hogar_chicos.length === 0) return 'adultos_mayores';
  if (hogar_chicos.length > 0 || hogar_tamano >= 3) return 'familia_con_ninos';
  return 'pareja';
}

function deriveNseProxy(tierMap: TierMap): string {
  const vals = Object.values(tierMap).filter((v): v is TierValue => v !== null && v !== undefined);
  if (vals.length === 0) return 'C3-D1';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg <= 1.5) return 'C2-C3';
  if (avg >= 2.5) return 'D1-D2';
  return 'C3-D1';
}

export function deriveProfile(answers: OnboardingAnswers): UserProfileInput {
  const t1 = toTierValue(answers.pref_almacen_1);
  const t2 = toTierValue(answers.pref_almacen_2);
  const almacenTier = averageTier(t1, t2);

  const tier_por_categoria: TierMap = {
    almacen: almacenTier,
    lacteos: toTierValue(answers.pref_lacteos),
    bebidas: toTierValue(answers.pref_bebidas),
    limpieza: toTierValue(answers.pref_limpieza),
    personal: toTierValue(answers.pref_personal),
  };

  const price_driven = Object.entries({
    almacen: answers.pref_almacen_1 === 'price_driven' && answers.pref_almacen_2 === 'price_driven',
    lacteos: answers.pref_lacteos === 'price_driven',
    bebidas: answers.pref_bebidas === 'price_driven',
    limpieza: answers.pref_limpieza === 'price_driven',
    personal: answers.pref_personal === 'price_driven',
  })
    .filter(([, v]) => v)
    .map(([k]) => k);

  return {
    nombre: answers.nombre,
    edad: answers.edad ?? null,
    genero: answers.genero ?? null,
    hogar_tamano: answers.hogar_tamano,
    hogar_chicos: answers.hogar_chicos,
    hogar_adultos_mayores: answers.hogar_adultos_mayores,
    hogar_mascotas: answers.hogar_mascotas,
    tier_por_categoria,
    price_driven,
    perfil_hogar: derivePerfilHogar(
      answers.hogar_tamano,
      answers.hogar_chicos,
      answers.hogar_adultos_mayores,
    ),
    nse_proxy: deriveNseProxy(tier_por_categoria),
    onboarding_done: true,
  };
}
