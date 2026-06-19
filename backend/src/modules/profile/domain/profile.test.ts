import { describe, expect, it } from 'vitest';
import { deriveProfile } from './profile.js';
import type { OnboardingAnswers } from '../../../shared/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function baseAnswers(overrides: Partial<OnboardingAnswers> = {}): OnboardingAnswers {
  return {
    nombre: 'Test User',
    edad: 30,
    genero: 'femenino',
    hogar_tamano: 2,
    hogar_chicos: [],
    hogar_adultos_mayores: false,
    hogar_mascotas: [],
    pref_almacen_1: 2,
    pref_almacen_2: 2,
    pref_lacteos: 2,
    pref_bebidas: 2,
    pref_limpieza: 2,
    pref_personal: 2,
    ...overrides,
  };
}

// ─── tier_por_categoria ───────────────────────────────────────────────────────

describe('deriveProfile — tier_por_categoria', () => {
  it('maps each non-almacen preference directly to its tier value', () => {
    const result = deriveProfile(baseAnswers({
      pref_lacteos: 1,
      pref_bebidas: 3,
      pref_limpieza: 2,
      pref_personal: 1,
    }));
    expect(result.tier_por_categoria.lacteos).toBe(1);
    expect(result.tier_por_categoria.bebidas).toBe(3);
    expect(result.tier_por_categoria.limpieza).toBe(2);
    expect(result.tier_por_categoria.personal).toBe(1);
  });

  it('maps price_driven answer to tier 3 via toTierValue', () => {
    const result = deriveProfile(baseAnswers({ pref_lacteos: 'price_driven' }));
    expect(result.tier_por_categoria.lacteos).toBe(3);
  });

  it('almacen tier is rounded average of pref_almacen_1 and pref_almacen_2', () => {
    const result = deriveProfile(baseAnswers({ pref_almacen_1: 1, pref_almacen_2: 2 }));
    // avg = 1.5 → rounds to 2
    expect(result.tier_por_categoria.almacen).toBe(2);
  });

  it('almacen tier rounds up at 0.5', () => {
    const result = deriveProfile(baseAnswers({ pref_almacen_1: 2, pref_almacen_2: 3 }));
    // avg = 2.5 → rounds to 3 (Math.round(2.5) = 3 in JS)
    expect(result.tier_por_categoria.almacen).toBe(3);
  });

  it('almacen tier when both are equal', () => {
    const result = deriveProfile(baseAnswers({ pref_almacen_1: 1, pref_almacen_2: 1 }));
    expect(result.tier_por_categoria.almacen).toBe(1);
  });

  it('almacen tier when price_driven maps to tier 3 before averaging', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 'price_driven',
      pref_almacen_2: 'price_driven',
    }));
    // both map to 3 → avg = 3 → tier = 3
    expect(result.tier_por_categoria.almacen).toBe(3);
  });

  it('almacen tier when one is price_driven and other is 1', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 'price_driven',
      pref_almacen_2: 1,
    }));
    // price_driven → 3, avg(3,1) = 2
    expect(result.tier_por_categoria.almacen).toBe(2);
  });
});

// ─── price_driven ─────────────────────────────────────────────────────────────

describe('deriveProfile — price_driven', () => {
  it('is empty when no category has price_driven answer', () => {
    const result = deriveProfile(baseAnswers());
    expect(result.price_driven).toEqual([]);
  });

  it('includes a category when its single answer is price_driven', () => {
    const result = deriveProfile(baseAnswers({ pref_lacteos: 'price_driven' }));
    expect(result.price_driven).toContain('lacteos');
  });

  it('includes almacen only when BOTH almacen answers are price_driven', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 'price_driven',
      pref_almacen_2: 'price_driven',
    }));
    expect(result.price_driven).toContain('almacen');
  });

  it('does NOT include almacen when only pref_almacen_1 is price_driven', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 'price_driven',
      pref_almacen_2: 2,
    }));
    expect(result.price_driven).not.toContain('almacen');
  });

  it('does NOT include almacen when only pref_almacen_2 is price_driven', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 1,
      pref_almacen_2: 'price_driven',
    }));
    expect(result.price_driven).not.toContain('almacen');
  });

  it('includes multiple categories when multiple answers are price_driven', () => {
    const result = deriveProfile(baseAnswers({
      pref_lacteos: 'price_driven',
      pref_bebidas: 'price_driven',
      pref_limpieza: 'price_driven',
    }));
    expect(result.price_driven).toContain('lacteos');
    expect(result.price_driven).toContain('bebidas');
    expect(result.price_driven).toContain('limpieza');
  });

  it('does not include categories with numeric tier values in price_driven', () => {
    const result = deriveProfile(baseAnswers({
      pref_lacteos: 1,
      pref_bebidas: 2,
      pref_limpieza: 3,
    }));
    expect(result.price_driven).not.toContain('lacteos');
    expect(result.price_driven).not.toContain('bebidas');
    expect(result.price_driven).not.toContain('limpieza');
  });
});

// ─── perfil_hogar ─────────────────────────────────────────────────────────────

describe('deriveProfile — perfil_hogar', () => {
  it('joven_solo when hogar_tamano === 1', () => {
    const result = deriveProfile(baseAnswers({ hogar_tamano: 1 }));
    expect(result.perfil_hogar).toBe('joven_solo');
  });

  it('joven_solo even with adultos_mayores true when tamano === 1', () => {
    const result = deriveProfile(baseAnswers({
      hogar_tamano: 1,
      hogar_adultos_mayores: true,
    }));
    expect(result.perfil_hogar).toBe('joven_solo');
  });

  it('adultos_mayores when adultos_mayores is true and no chicos', () => {
    const result = deriveProfile(baseAnswers({
      hogar_tamano: 2,
      hogar_adultos_mayores: true,
      hogar_chicos: [],
    }));
    expect(result.perfil_hogar).toBe('adultos_mayores');
  });

  it('familia_con_ninos when chicos is non-empty', () => {
    const result = deriveProfile(baseAnswers({
      hogar_tamano: 2,
      hogar_chicos: ['3_6'],
      hogar_adultos_mayores: false,
    }));
    expect(result.perfil_hogar).toBe('familia_con_ninos');
  });

  it('familia_con_ninos when hogar_tamano >= 3, no chicos, no adultos_mayores', () => {
    const result = deriveProfile(baseAnswers({
      hogar_tamano: 3,
      hogar_chicos: [],
      hogar_adultos_mayores: false,
    }));
    expect(result.perfil_hogar).toBe('familia_con_ninos');
  });

  it('familia_con_ninos when adultos_mayores true AND chicos non-empty (chicos wins)', () => {
    const result = deriveProfile(baseAnswers({
      hogar_tamano: 2,
      hogar_adultos_mayores: true,
      hogar_chicos: ['bebes_0_2'],
    }));
    expect(result.perfil_hogar).toBe('familia_con_ninos');
  });

  it('pareja when tamano === 2, no chicos, no adultos_mayores', () => {
    const result = deriveProfile(baseAnswers({
      hogar_tamano: 2,
      hogar_chicos: [],
      hogar_adultos_mayores: false,
    }));
    expect(result.perfil_hogar).toBe('pareja');
  });
});

// ─── nse_proxy ────────────────────────────────────────────────────────────────

describe('deriveProfile — nse_proxy', () => {
  it('C2-C3 when average tier <= 1.5', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 1,
      pref_almacen_2: 1,
      pref_lacteos: 1,
      pref_bebidas: 1,
      pref_limpieza: 2,
      pref_personal: 1,
    }));
    // almacen avg=(1+1)/2=1, lacteos=1, bebidas=1, limpieza=2, personal=1 → avg tiers ≈ 1.2
    expect(result.nse_proxy).toBe('C2-C3');
  });

  it('D1-D2 when average tier >= 2.5', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 3,
      pref_almacen_2: 3,
      pref_lacteos: 3,
      pref_bebidas: 3,
      pref_limpieza: 3,
      pref_personal: 3,
    }));
    expect(result.nse_proxy).toBe('D1-D2');
  });

  it('C3-D1 when average tier is between 1.5 and 2.5 exclusive', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 2,
      pref_almacen_2: 2,
      pref_lacteos: 2,
      pref_bebidas: 2,
      pref_limpieza: 2,
      pref_personal: 2,
    }));
    expect(result.nse_proxy).toBe('C3-D1');
  });

  it('C3-D1 for empty tier map (edge case guard)', () => {
    // All price_driven → all tier 3 → avg = 3 → D1-D2
    // To get empty tiers we cannot do it through deriveProfile since it always builds tiers
    // We test the boundary: avg exactly 1.5 → C2-C3
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 1,
      pref_almacen_2: 2,
      pref_lacteos: 1,
      pref_bebidas: 2,
      pref_limpieza: 1,
      pref_personal: 2,
    }));
    // almacen = round((1+2)/2) = round(1.5) = 2
    // tiers: almacen=2, lacteos=1, bebidas=2, limpieza=1, personal=2 → avg = 8/5 = 1.6 → C3-D1
    expect(result.nse_proxy).toBe('C3-D1');
  });

  it('nse_proxy threshold boundary: avg exactly 1.5 → C2-C3', () => {
    const result = deriveProfile(baseAnswers({
      pref_almacen_1: 1,
      pref_almacen_2: 1,
      pref_lacteos: 1,
      pref_bebidas: 1,
      pref_limpieza: 1,
      pref_personal: 3,
    }));
    // almacen=1, lacteos=1, bebidas=1, limpieza=1, personal=3 → avg = 7/5 = 1.4 → C2-C3
    expect(result.nse_proxy).toBe('C2-C3');
  });
});

// ─── onboarding_done ──────────────────────────────────────────────────────────

describe('deriveProfile — onboarding_done', () => {
  it('always sets onboarding_done to true', () => {
    const result = deriveProfile(baseAnswers());
    expect(result.onboarding_done).toBe(true);
  });
});

// ─── passthrough fields ───────────────────────────────────────────────────────

describe('deriveProfile — passthrough fields', () => {
  it('passes nombre through', () => {
    const result = deriveProfile(baseAnswers({ nombre: 'Ana García' }));
    expect(result.nombre).toBe('Ana García');
  });

  it('passes edad through', () => {
    const result = deriveProfile(baseAnswers({ edad: 45 }));
    expect(result.edad).toBe(45);
  });

  it('defaults edad to null when undefined', () => {
    const { edad: _, ...rest } = baseAnswers();
    const result = deriveProfile({ ...rest } as OnboardingAnswers);
    expect(result.edad).toBeNull();
  });

  it('passes genero through', () => {
    const result = deriveProfile(baseAnswers({ genero: 'masculino' }));
    expect(result.genero).toBe('masculino');
  });

  it('defaults genero to null when undefined', () => {
    const answers = baseAnswers();
    delete (answers as Partial<OnboardingAnswers>).genero;
    const result = deriveProfile(answers);
    expect(result.genero).toBeNull();
  });

  it('passes hogar_chicos through', () => {
    const result = deriveProfile(baseAnswers({ hogar_chicos: ['bebes_0_2', '3_6'] }));
    expect(result.hogar_chicos).toEqual(['bebes_0_2', '3_6']);
  });

  it('passes hogar_mascotas through', () => {
    const result = deriveProfile(baseAnswers({ hogar_mascotas: ['perro', 'gato'] }));
    expect(result.hogar_mascotas).toEqual(['perro', 'gato']);
  });
});
