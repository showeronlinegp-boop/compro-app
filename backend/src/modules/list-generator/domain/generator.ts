import type { UserProfile } from '../../../shared/types.js';
import { stripDiacritics } from '../../../shared/normalize.js';

export interface ListTemplateItem {
  id: number;
  perfil_hogar: string;
  category_key: string;
  item_name: string;
  qty_base: number;
  scale_per_person: number;
  frequency_days: number;
  requires_module: string | null;
  search_keyword: string | null;
  size_hint: string | null;
  incluye: string[];
  requiere_alguno: string[];
  excluye: string[];
  veta: string[];
}

export interface MatchRules {
  incluye: string[];
  requiere_alguno: string[];
  excluye: string[];
  veta: string[];
}

export interface ProductCandidate {
  id: number;
  name: string;
  brand_tier: number | null;
  price: number;
}

function parsearMedida(name: string): { valor: number; base: 'kg' | 'l' | 'u' } {
  const t = stripDiacritics(name).replace(',', '.');
  let m: RegExpMatchArray | null;

  m = t.match(/(\d+(?:\.\d+)?)\s*(?:l|lt|lts|litro|litros)\b/);
  if (m?.[1]) return { valor: parseFloat(m[1]), base: 'l' };

  m = t.match(/(\d+(?:\.\d+)?)\s*(?:ml|cc)\b/);
  if (m?.[1]) return { valor: parseFloat(m[1]) / 1000, base: 'l' };

  m = t.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)\b/);
  if (m?.[1]) return { valor: parseFloat(m[1]), base: 'kg' };

  m = t.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos)\b/);
  if (m?.[1]) return { valor: parseFloat(m[1]) / 1000, base: 'kg' };

  m = t.match(/x\s*(\d+)\s*(?:u|uni|unidades|rollos)?/);
  if (m?.[1]) return { valor: parseFloat(m[1]), base: 'u' };

  return { valor: 1, base: 'u' };
}

function mediana(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function scoreTier(brandTier: number | null, requestedTier: number): number {
  if (brandTier === null) return 0;
  if (brandTier === requestedTier) return 30;
  if (Math.abs(brandTier - requestedTier) === 1) return 20;
  return 10;
}

// requiere_alguno es HARD solo cuando incluye está vacío (es el único discriminador de tipo).
// Cuando incluye ya identifica el ítem, requiere_alguno es SUAVE: bono de scoring, no filtro.
export function matchesRules(name: string, rules: MatchRules, tier = 2): boolean {
  const n = stripDiacritics(name);
  if (rules.incluye.length > 0 && !rules.incluye.every(k => n.includes(stripDiacritics(k)))) return false;
  const requiereEsHard = rules.incluye.length === 0;
  if (requiereEsHard && rules.requiere_alguno.length > 0 && !rules.requiere_alguno.some(k => n.includes(stripDiacritics(k)))) return false;
  if (rules.excluye.some(k => n.includes(stripDiacritics(k)))) return false;
  if (tier !== 1 && rules.veta.some(k => n.includes(stripDiacritics(k)))) return false;
  return true;
}

export function selectBestProduct(
  candidates: ProductCandidate[],
  rules: MatchRules,
  tier: number,
  priceDriven: boolean,
): number | null {
  const hasRules = rules.incluye.length > 0 || rules.requiere_alguno.length > 0
    || rules.excluye.length > 0 || rules.veta.length > 0;

  let filtered: Array<ProductCandidate & { _pu: number }>;

  if (hasRules) {
    const passed = candidates.filter(c => matchesRules(c.name, rules, tier));
    if (!passed.length) return null;
    filtered = passed.map(c => {
      const m = parsearMedida(c.name);
      return { ...c, _pu: m.valor > 0 ? Number(c.price) / m.valor : Number(c.price) };
    });
  } else {
    filtered = candidates.map(c => {
      const m = parsearMedida(c.name);
      return { ...c, _pu: m.valor > 0 ? Number(c.price) / m.valor : Number(c.price) };
    });
  }

  const FACTOR = 2.2;
  const med = mediana(filtered.map(c => c._pu));
  if (med > 0) {
    const noOutliers = filtered.filter(c => c._pu <= med * FACTOR && c._pu >= med / FACTOR);
    if (noOutliers.length) filtered = noOutliers;
  }

  // requiere_alguno como bono suave cuando incluye ya filtra el tipo
  const requiereEsHard = rules.incluye.length === 0;
  function scoreReq(name: string): number {
    if (requiereEsHard || !rules.requiere_alguno.length) return 0;
    const n = stripDiacritics(name);
    return rules.requiere_alguno.some(k => n.includes(stripDiacritics(k))) ? 1 : 0;
  }

  filtered.sort((a, b) => {
    const sa = scoreTier(a.brand_tier, tier);
    const sb = scoreTier(b.brand_tier, tier);
    if (sb !== sa) return sb - sa;
    const ra = scoreReq(a.name), rb = scoreReq(b.name);
    if (rb !== ra) return rb - ra;
    return a._pu - b._pu; // más barato por unidad
  });

  return filtered[0]?.id ?? null;
}

export function calcQtyFinal(item: ListTemplateItem, hogar_tamano: number): number {
  const extra = Math.max(0, hogar_tamano - 2);
  return Math.max(1, Math.round(item.qty_base + item.scale_per_person * extra));
}

export function shouldIncludeItem(item: ListTemplateItem, profile: UserProfile): boolean {
  const mod = item.requires_module;
  if (!mod) return true;
  switch (mod) {
    case 'chicos':
      return (profile.hogar_chicos?.length ?? 0) > 0;
    case 'bebes':
      return profile.hogar_chicos?.includes('bebes_0_2') ?? false;
    case 'mascotas_perro':
      return profile.hogar_mascotas?.includes('perro') ?? false;
    case 'mascotas_gato':
      return profile.hogar_mascotas?.includes('gato') ?? false;
    case 'adultos_mayores':
      return profile.hogar_adultos_mayores;
    case 'gestion_menstrual':
      return profile.genero === 'femenino';
    case 'afeitado':
      return profile.genero === 'masculino';
    default:
      return false;
  }
}
