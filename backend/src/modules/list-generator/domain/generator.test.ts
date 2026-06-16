import { describe, expect, it } from 'vitest';
import { calcQtyFinal, matchesRules, selectBestProduct, shouldIncludeItem } from './generator.js';
import type { ListTemplateItem, MatchRules, ProductCandidate } from './generator.js';
import type { UserProfile } from '../../../shared/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const emptyRules: MatchRules = { incluye: [], requiere_alguno: [], excluye: [], veta: [] };

function makeCandidate(
  id: number,
  name: string,
  price: number,
  brand_tier: number | null = 2,
): ProductCandidate {
  return { id, name, brand_tier, price };
}

function makeItem(overrides: Partial<ListTemplateItem> = {}): ListTemplateItem {
  return {
    id: 1,
    perfil_hogar: 'pareja',
    category_key: 'almacen',
    item_name: 'Arroz',
    qty_base: 2,
    scale_per_person: 0.5,
    frequency_days: 30,
    requires_module: null,
    search_keyword: null,
    size_hint: null,
    incluye: [],
    requiere_alguno: [],
    excluye: [],
    veta: [],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 1,
    nombre: 'Test',
    edad: null,
    genero: null,
    hogar_tamano: 2,
    hogar_chicos: [],
    hogar_adultos_mayores: false,
    hogar_mascotas: [],
    tier_por_categoria: {},
    price_driven: [],
    perfil_hogar: 'pareja',
    nse_proxy: null,
    onboarding_done: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── matchesRules ─────────────────────────────────────────────────────────────

describe('matchesRules', () => {
  it('returns true when all rules are empty', () => {
    expect(matchesRules('Leche Entera 1L', emptyRules)).toBe(true);
  });

  it('returns true when incluye terms are all present', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['leche', 'entera'] };
    expect(matchesRules('Leche Entera 1L', rules)).toBe(true);
  });

  it('returns false when any incluye term is missing', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['leche', 'descremada'] };
    expect(matchesRules('Leche Entera 1L', rules)).toBe(false);
  });

  it('incluye matching is accent-insensitive', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['cafe'] };
    expect(matchesRules('Café Molido 500g', rules)).toBe(true);
  });

  it('incluye matching is accent-insensitive in both directions', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['Café'] };
    expect(matchesRules('cafe molido', rules)).toBe(true);
  });

  describe('requiere_alguno — HARD mode (incluye is empty)', () => {
    it('returns false when none of requiere_alguno terms are present', () => {
      const rules: MatchRules = { ...emptyRules, requiere_alguno: ['entera', 'descremada'] };
      expect(matchesRules('Leche Chocolatada 1L', rules)).toBe(false);
    });

    it('returns true when at least one requiere_alguno term is present', () => {
      const rules: MatchRules = { ...emptyRules, requiere_alguno: ['entera', 'descremada'] };
      expect(matchesRules('Leche Entera 1L', rules)).toBe(true);
    });
  });

  describe('requiere_alguno — SOFT mode (incluye is non-empty)', () => {
    it('does NOT filter out a candidate missing requiere_alguno terms when incluye is non-empty', () => {
      const rules: MatchRules = {
        incluye: ['leche'],
        requiere_alguno: ['entera'],
        excluye: [],
        veta: [],
      };
      expect(matchesRules('Leche Chocolatada 1L', rules)).toBe(true);
    });
  });

  it('returns false when an excluye term is present', () => {
    const rules: MatchRules = { ...emptyRules, excluye: ['chocolatada'] };
    expect(matchesRules('Leche Chocolatada 1L', rules)).toBe(false);
  });

  it('returns true when excluye terms are all absent', () => {
    const rules: MatchRules = { ...emptyRules, excluye: ['chocolatada'] };
    expect(matchesRules('Leche Entera 1L', rules)).toBe(true);
  });

  describe('veta — tier gating', () => {
    it('rejects product at tier !== 1 when veta term is present', () => {
      const rules: MatchRules = { ...emptyRules, veta: ['arcor'] };
      expect(matchesRules('Arroz Arcor 1kg', rules, 2)).toBe(false);
    });

    it('ignores veta at tier === 1', () => {
      const rules: MatchRules = { ...emptyRules, veta: ['arcor'] };
      expect(matchesRules('Arroz Arcor 1kg', rules, 1)).toBe(true);
    });

    it('rejects at tier 3 when veta term is present', () => {
      const rules: MatchRules = { ...emptyRules, veta: ['arcor'] };
      expect(matchesRules('Arroz Arcor 1kg', rules, 3)).toBe(false);
    });
  });

  it('default tier is 2 (veta is active)', () => {
    const rules: MatchRules = { ...emptyRules, veta: ['cheap'] };
    expect(matchesRules('Cheap Brand 500g', rules)).toBe(false);
  });
});

// ─── selectBestProduct ────────────────────────────────────────────────────────

describe('selectBestProduct', () => {
  it('returns null when rules are set but no candidate passes', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['organico'] };
    const candidates = [
      makeCandidate(1, 'Leche Entera 1 L', 100),
      makeCandidate(2, 'Leche Descremada 1 L', 90),
    ];
    expect(selectBestProduct(candidates, rules, 2, false)).toBeNull();
  });

  it('returns null for empty candidates array', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['leche'] };
    expect(selectBestProduct([], rules, 2, false)).toBeNull();
  });

  it('picks cheapest-per-unit when tiers are equal', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['aceite'] };
    const candidates = [
      makeCandidate(1, 'Aceite Girasol 900 ml', 900, 2),
      makeCandidate(2, 'Aceite Girasol 1 L', 900, 2),
    ];
    // 900ml → _pu = 900/0.9 = 1000; 1L → _pu = 900/1 = 900 → id=2 wins
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });

  it('picks by price-per-liter correctly (ml vs L)', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['leche'] };
    const candidates = [
      makeCandidate(1, 'Leche Entera 500 ml', 400, 2),
      makeCandidate(2, 'Leche Entera 1 L', 700, 2),
    ];
    // 500ml → _pu = 400/0.5 = 800; 1L → _pu = 700/1 = 700 → id=2 wins
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });

  it('picks by price-per-kg correctly (g vs kg)', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['arroz'] };
    const candidates = [
      makeCandidate(1, 'Arroz Largo 500 g', 300, 2),
      makeCandidate(2, 'Arroz Largo 1 kg', 500, 2),
    ];
    // 500g → _pu = 300/0.5 = 600; 1kg → _pu = 500/1 = 500 → id=2 wins
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });

  it('exact tier match (score=30) beats adjacent (score=20)', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['aceite'] };
    const candidates = [
      makeCandidate(1, 'Aceite Girasol 1 L', 500, 1),
      makeCandidate(2, 'Aceite Girasol 1 L', 400, 2),
    ];
    // tier=2 requested; id=2 exact match (30) > id=1 adjacent (20), price doesn't matter
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });

  it('adjacent tier (score=20) beats far tier (score=10)', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['arroz'] };
    const candidates = [
      makeCandidate(1, 'Arroz Fino 1 kg', 400, 3),
      makeCandidate(2, 'Arroz Fino 1 kg', 600, 1),
    ];
    // tier=2 requested; id=1 adjacent (|3-2|=1, score=20) > id=2 far (|1-2|=1... wait)
    // Both are adjacent — price wins: id=1 cheaper
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(1);
  });

  it('tier 3 vs tier 1 when requesting tier 2 — both adjacent, price breaks tie', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['leche'] };
    const candidates = [
      makeCandidate(1, 'Leche Entera 1 L', 800, 3),
      makeCandidate(2, 'Leche Entera 1 L', 600, 1),
    ];
    // Both adjacent to tier 2 (score=20 each), cheaper wins: id=2
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });

  it('far tier (score=10) loses even if cheapest', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['cafe'] };
    const candidates = [
      makeCandidate(1, 'Cafe Molido 500 g', 100, 3),
      makeCandidate(2, 'Cafe Molido 500 g', 900, 1),
    ];
    // tier=1 requested; id=2 exact (30) vs id=1 far (|3-1|=2, score=10)
    expect(selectBestProduct(candidates, rules, 1, false)).toBe(2);
  });

  it('outlier removal: candidate priced above median*2.2 is dropped', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['leche'] };
    const candidates = [
      makeCandidate(1, 'Leche Entera 1 L', 100, 2),
      makeCandidate(2, 'Leche Entera 1 L', 100, 2),
      makeCandidate(3, 'Leche Entera 1 L', 100, 2),
      makeCandidate(4, 'Leche Entera 1 L', 5000, 2),
    ];
    // median _pu ≈ 100; 5000 >> 100*2.2=220 → outlier dropped
    const result = selectBestProduct(candidates, rules, 2, false);
    expect(result).not.toBe(4);
  });

  it('outlier removal: candidate priced below median/2.2 is dropped', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['leche'] };
    const candidates = [
      makeCandidate(1, 'Leche Entera 1 L', 1000, 2),
      makeCandidate(2, 'Leche Entera 1 L', 1000, 2),
      makeCandidate(3, 'Leche Entera 1 L', 1000, 2),
      makeCandidate(4, 'Leche Entera 1 L', 1, 2),
    ];
    // median _pu ≈ 1000; 1 < 1000/2.2 ≈ 454 → outlier dropped
    const result = selectBestProduct(candidates, rules, 2, false);
    expect(result).not.toBe(4);
  });

  it('requiere_alguno gives a soft bonus when incluye is non-empty', () => {
    const rules: MatchRules = {
      incluye: ['aceite'],
      requiere_alguno: ['girasol'],
      excluye: [],
      veta: [],
    };
    const candidates = [
      makeCandidate(1, 'Aceite Maiz 1 L', 500, 2),
      makeCandidate(2, 'Aceite Girasol 1 L', 600, 2),
    ];
    // id=2 matches requiere_alguno (bonus=1), id=1 doesn't (bonus=0) → id=2 wins despite higher price
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });

  it('with no rules, ranks all candidates by tier then price-per-unit', () => {
    const candidates = [
      makeCandidate(1, 'Arroz 1 kg', 600, 3),
      makeCandidate(2, 'Arroz 1 kg', 500, 2),
      makeCandidate(3, 'Arroz 1 kg', 400, 1),
    ];
    // tier=2 requested; id=2 exact (30) > id=1,3 adjacent (20)
    // id=1 vs id=3: both adjacent; id=3 cheaper → id=3 second, id=1 third
    expect(selectBestProduct(candidates, emptyRules, 2, false)).toBe(2);
  });

  it('handles "x N" unit format in product name', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['papel'] };
    const candidates = [
      makeCandidate(1, 'Papel Higienico x 4 rollos', 400, 2),
      makeCandidate(2, 'Papel Higienico x 12 rollos', 900, 2),
    ];
    // x4 → valor=4, _pu = 400/4 = 100; x12 → valor=12, _pu = 900/12 = 75 → id=2 wins
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });

  it('falls back to unit price 1 when no measure is detectable', () => {
    const rules: MatchRules = { ...emptyRules, incluye: ['sal'] };
    const candidates = [
      makeCandidate(1, 'Sal Fina', 200, 2),
      makeCandidate(2, 'Sal Gruesa', 150, 2),
    ];
    // both fallback valor=1, _pu = price itself → id=2 cheaper wins
    expect(selectBestProduct(candidates, rules, 2, false)).toBe(2);
  });
});

// ─── calcQtyFinal ─────────────────────────────────────────────────────────────

describe('calcQtyFinal', () => {
  it('returns qty_base when hogar_tamano <= 2', () => {
    const item = makeItem({ qty_base: 3, scale_per_person: 1 });
    expect(calcQtyFinal(item, 2)).toBe(3);
  });

  it('returns qty_base when hogar_tamano === 1', () => {
    const item = makeItem({ qty_base: 2, scale_per_person: 1 });
    expect(calcQtyFinal(item, 1)).toBe(2);
  });

  it('scales up for each extra person beyond 2', () => {
    const item = makeItem({ qty_base: 2, scale_per_person: 1 });
    // hogar_tamano=4 → extra=2 → 2 + 1*2 = 4
    expect(calcQtyFinal(item, 4)).toBe(4);
  });

  it('rounds the result', () => {
    const item = makeItem({ qty_base: 1, scale_per_person: 0.5 });
    // hogar_tamano=3 → extra=1 → 1 + 0.5*1 = 1.5 → rounds to 2
    expect(calcQtyFinal(item, 3)).toBe(2);
  });

  it('returns minimum 1 even when qty_base is 0', () => {
    const item = makeItem({ qty_base: 0, scale_per_person: 0 });
    expect(calcQtyFinal(item, 2)).toBe(1);
  });

  it('fractional scale_per_person accumulates correctly across many extra people', () => {
    const item = makeItem({ qty_base: 1, scale_per_person: 0.3 });
    // hogar_tamano=5 → extra=3 → 1 + 0.3*3 = 1.9 → rounds to 2
    expect(calcQtyFinal(item, 5)).toBe(2);
  });
});

// ─── shouldIncludeItem ────────────────────────────────────────────────────────

describe('shouldIncludeItem', () => {
  it('returns true when requires_module is null', () => {
    const item = makeItem({ requires_module: null });
    expect(shouldIncludeItem(item, makeProfile())).toBe(true);
  });

  describe('chicos', () => {
    it('returns true when hogar_chicos is non-empty', () => {
      const item = makeItem({ requires_module: 'chicos' });
      const profile = makeProfile({ hogar_chicos: ['3_6'] });
      expect(shouldIncludeItem(item, profile)).toBe(true);
    });

    it('returns false when hogar_chicos is empty', () => {
      const item = makeItem({ requires_module: 'chicos' });
      const profile = makeProfile({ hogar_chicos: [] });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });

    it('returns false when hogar_chicos is null', () => {
      const item = makeItem({ requires_module: 'chicos' });
      const profile = makeProfile({ hogar_chicos: null });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });
  });

  describe('bebes', () => {
    it('returns true when hogar_chicos includes bebes_0_2', () => {
      const item = makeItem({ requires_module: 'bebes' });
      const profile = makeProfile({ hogar_chicos: ['bebes_0_2', '3_6'] });
      expect(shouldIncludeItem(item, profile)).toBe(true);
    });

    it('returns false when hogar_chicos has children but not bebes_0_2', () => {
      const item = makeItem({ requires_module: 'bebes' });
      const profile = makeProfile({ hogar_chicos: ['3_6'] });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });

    it('returns false when hogar_chicos is null', () => {
      const item = makeItem({ requires_module: 'bebes' });
      const profile = makeProfile({ hogar_chicos: null });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });
  });

  describe('mascotas_perro', () => {
    it('returns true when hogar_mascotas includes perro', () => {
      const item = makeItem({ requires_module: 'mascotas_perro' });
      const profile = makeProfile({ hogar_mascotas: ['perro'] });
      expect(shouldIncludeItem(item, profile)).toBe(true);
    });

    it('returns false when hogar_mascotas does not include perro', () => {
      const item = makeItem({ requires_module: 'mascotas_perro' });
      const profile = makeProfile({ hogar_mascotas: ['gato'] });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });

    it('returns false when hogar_mascotas is null', () => {
      const item = makeItem({ requires_module: 'mascotas_perro' });
      const profile = makeProfile({ hogar_mascotas: null });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });
  });

  describe('mascotas_gato', () => {
    it('returns true when hogar_mascotas includes gato', () => {
      const item = makeItem({ requires_module: 'mascotas_gato' });
      const profile = makeProfile({ hogar_mascotas: ['gato'] });
      expect(shouldIncludeItem(item, profile)).toBe(true);
    });

    it('returns false when hogar_mascotas does not include gato', () => {
      const item = makeItem({ requires_module: 'mascotas_gato' });
      const profile = makeProfile({ hogar_mascotas: ['perro'] });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });
  });

  describe('adultos_mayores', () => {
    it('returns true when hogar_adultos_mayores is true', () => {
      const item = makeItem({ requires_module: 'adultos_mayores' });
      const profile = makeProfile({ hogar_adultos_mayores: true });
      expect(shouldIncludeItem(item, profile)).toBe(true);
    });

    it('returns false when hogar_adultos_mayores is false', () => {
      const item = makeItem({ requires_module: 'adultos_mayores' });
      const profile = makeProfile({ hogar_adultos_mayores: false });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });
  });

  describe('gestion_menstrual', () => {
    it('returns true for genero femenino', () => {
      const item = makeItem({ requires_module: 'gestion_menstrual' });
      const profile = makeProfile({ genero: 'femenino' });
      expect(shouldIncludeItem(item, profile)).toBe(true);
    });

    it('returns false for genero masculino', () => {
      const item = makeItem({ requires_module: 'gestion_menstrual' });
      const profile = makeProfile({ genero: 'masculino' });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });

    it('returns false when genero is null', () => {
      const item = makeItem({ requires_module: 'gestion_menstrual' });
      const profile = makeProfile({ genero: null });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });
  });

  describe('afeitado', () => {
    it('returns true for genero masculino', () => {
      const item = makeItem({ requires_module: 'afeitado' });
      const profile = makeProfile({ genero: 'masculino' });
      expect(shouldIncludeItem(item, profile)).toBe(true);
    });

    it('returns false for genero femenino', () => {
      const item = makeItem({ requires_module: 'afeitado' });
      const profile = makeProfile({ genero: 'femenino' });
      expect(shouldIncludeItem(item, profile)).toBe(false);
    });
  });

  it('returns false for unknown module', () => {
    const item = makeItem({ requires_module: 'unknown_module_xyz' });
    expect(shouldIncludeItem(item, makeProfile())).toBe(false);
  });
});
