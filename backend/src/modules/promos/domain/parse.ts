/**
 * Pure parsers for extracting structured data from raw promo text and image filenames.
 * No side effects, no I/O — safe to use in page.evaluate context and tests.
 */

/**
 * Extract the first integer percentage from text.
 * Returns null if no match or value > 100.
 */
export function parseDiscountPct(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? '0', 10);
  return n <= 100 ? n : null;
}

/**
 * Extract the installment count from text.
 * Handles "4 cuotas", "3 y 6 Cuotas", "12 cuotas sin interés".
 * Returns the FIRST number before "cuotas".
 * Returns null if "Sin Interés" only with no cuotas count.
 */
export function parseInstallments(text: string): number | null {
  const m = text.match(/(\d{1,2})(?:\s*[,y]\s*\d{1,2})*\s*cuotas/i);
  if (!m) return null;
  return Number.parseInt(m[1] ?? '0', 10);
}

/**
 * Detect interest-free status from text.
 * Returns true for "sin interés", false for "con interés", null if undetectable.
 */
export function parseInterestFree(text: string): boolean | null {
  if (/sin\s+inter[eé]s/i.test(text)) return true;
  if (/con\s+inter[eé]s/i.test(text)) return false;
  return null;
}

/**
 * Map a logo filename (last URL segment or bare filename) to a canonical bank name.
 * Returns null if no known bank matches.
 */
export function bankFromLogo(filename: string | null): string | null {
  if (!filename) return null;

  // Decode URL encoding, lowercase, strip extension and size suffixes
  let name: string;
  try {
    name = decodeURIComponent(filename);
  } catch {
    name = filename;
  }
  // Remove extension
  name = name.replace(/\.[a-z]{2,5}(\?.*)?$/i, '');
  // Remove dimension suffixes like -200x82 or _200x82
  name = name.replace(/[-_]\d{2,4}x\d{2,4}/g, '');
  // Lowercase, collapse separators (- _ and runs of whitespace) to single spaces
  // so "mercado-pago", "mercado_pago" and "Mercado Pago" all match the same keyword.
  name = name
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ')
    .trim();

  // Keyword map — order matters (more specific first). Keywords use space-form.
  if (name.includes('galicia')) return 'Galicia';
  if (name.includes('santander')) return 'Santander';
  if (name.includes('patagonia')) return 'Banco Patagonia';
  if (name.includes('naranjax') || name.includes('naranja')) return 'Naranja X';
  if (name.includes('bancor')) return 'Bancor';
  if (name.includes('comafi')) return 'Comafi';
  // Club La Nación must be checked before Banco Nación: "lanacion" contains "nacion".
  if (name.includes('lanacion') || name.includes('la nacion') || name.includes('la nación'))
    return 'Club La Nación';
  if (name.includes('nacion') || name.includes('nación')) return 'Banco Nación';
  if (name.includes('macro')) return 'Macro';
  if (name.includes('cencopay')) return 'Cencopay';
  if (name.includes('mercado pago') || name.includes('mercadopago')) return 'Mercado Pago';
  if (name.includes('cuenta dni') || name.includes('cuentadni')) return 'Cuenta DNI';
  if (name.includes('anses')) return 'ANSES';
  if (name.includes('tuya')) return 'Tuya';
  if (name.includes('credicuotas')) return 'Credicuotas';
  if (name.includes('billeteras') || name === 'bv') return 'Billeteras Virtuales';
  if (name.includes('modo')) return 'MODO';
  if (name.includes('prex')) return 'Prex';
  if (name.includes('personalpay') || name.includes('personal pay')) return 'Personal Pay';
  if (
    name.includes('carrefour banco') ||
    name.includes('carrefour credito') ||
    name.includes('cuentadigital') ||
    name.includes('cuenta digital') ||
    name.includes('micrf')
  )
    return 'Carrefour Banco';
  if (name.includes('empleados')) return 'Empleados Públicos';
  if (name.includes('tarjetasol') || name.includes('tarjeta sol')) return 'Tarjeta Sol';
  if (name.includes('visa') || name.includes('master')) return 'Visa/Mastercard';

  return null;
}
