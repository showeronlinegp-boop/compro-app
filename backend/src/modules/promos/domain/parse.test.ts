import { describe, expect, it } from 'vitest';
import { bankFromLogo, parseDiscountPct, parseInstallments, parseInterestFree } from './parse.js';

describe('parseDiscountPct', () => {
  it('extracts integer percentage', () => {
    expect(parseDiscountPct('20% de descuento')).toBe(20);
  });

  it('handles percentage with spaces', () => {
    expect(parseDiscountPct('15 % off')).toBe(15);
  });

  it('returns null when no percentage', () => {
    expect(parseDiscountPct('sin interés')).toBeNull();
  });

  it('returns null for > 100', () => {
    expect(parseDiscountPct('150%')).toBeNull();
  });

  it('handles exactly 100%', () => {
    expect(parseDiscountPct('100%')).toBe(100);
  });

  it('extracts first match', () => {
    expect(parseDiscountPct('30% hasta 5%')).toBe(30);
  });
});

describe('parseInstallments', () => {
  it('parses simple cuotas', () => {
    expect(parseInstallments('4 cuotas sin interés')).toBe(4);
  });

  it('parses cuotas without space', () => {
    expect(parseInstallments('4cuotas Sin Interés')).toBe(4);
  });

  it('parses first of multiple cuota counts', () => {
    expect(parseInstallments('3 y 6 Cuotas sin interés')).toBe(3);
  });

  it('returns null when no cuotas', () => {
    expect(parseInstallments('20% de descuento')).toBeNull();
  });

  it('returns null for Sin Interés only', () => {
    expect(parseInstallments('Sin Interés')).toBeNull();
  });

  it('parses 12 cuotas', () => {
    expect(parseInstallments('12 cuotas sin interés en compras superiores a $5000')).toBe(12);
  });
});

describe('parseInterestFree', () => {
  it('returns true for sin interés', () => {
    expect(parseInterestFree('3 cuotas sin interés')).toBe(true);
  });

  it('returns true for sin interés with accent', () => {
    expect(parseInterestFree('6 cuotas Sin Interés')).toBe(true);
  });

  it('returns false for con interés', () => {
    expect(parseInterestFree('12 cuotas con interés')).toBe(false);
  });

  it('returns null for undetectable', () => {
    expect(parseInterestFree('20% de descuento')).toBeNull();
  });
});

describe('bankFromLogo', () => {
  it('returns null for null input', () => {
    expect(bankFromLogo(null)).toBeNull();
  });

  it('maps galicia filename', () => {
    expect(bankFromLogo('galicia-200x82.png')).toBe('Galicia');
  });

  it('maps patagonia with decorators', () => {
    expect(bankFromLogo('-_Promo-bancaria_patagonia (1).webp')).toBe('Banco Patagonia');
  });

  it('maps NaranjaX', () => {
    expect(bankFromLogo('NaranjaX-logo.png')).toBe('Naranja X');
  });

  it('maps Mercado Pago with space', () => {
    expect(bankFromLogo('Mercado Pago grande.png')).toBe('Mercado Pago');
  });

  it('maps mercadopago concatenated', () => {
    expect(bankFromLogo('mercadopago-logo.png')).toBe('Mercado Pago');
  });

  it('maps santander', () => {
    expect(bankFromLogo('santander-200x100.png')).toBe('Santander');
  });

  it('maps macro', () => {
    expect(bankFromLogo('macro-bank.png')).toBe('Macro');
  });

  it('returns null for unknown logo', () => {
    expect(bankFromLogo('unknown-bank-xyz.png')).toBeNull();
  });

  it('handles URL-encoded filenames', () => {
    expect(bankFromLogo('galicia%20logo.png')).toBe('Galicia');
  });

  it('maps hyphenated mercado-pago to Mercado Pago', () => {
    expect(bankFromLogo('mercado-pago -1.webp')).toBe('Mercado Pago');
  });

  it('maps Mi Carrefour (MiCRF) logo to Carrefour Banco', () => {
    expect(bankFromLogo('Logo-MiCRF-Clasico_382x125.png')).toBe('Carrefour Banco');
  });

  it('maps cuentaDigital to Carrefour Banco', () => {
    expect(bankFromLogo('cuentaDigital.webp')).toBe('Carrefour Banco');
  });

  it('maps Cuenta DNI', () => {
    expect(bankFromLogo('Cuenta_dni.png')).toBe('Cuenta DNI');
  });

  it('maps Banco Naranja (spaced) to Naranja X', () => {
    expect(bankFromLogo('Banco Naranja grande.png')).toBe('Naranja X');
  });

  it('maps club_lanacion to Club La Nación', () => {
    expect(bankFromLogo('club_lanacion.webp')).toBe('Club La Nación');
  });

  it('maps cencopay and comafi', () => {
    expect(bankFromLogo('cencopay1.png')).toBe('Cencopay');
    expect(bankFromLogo('comafi-vtex.png')).toBe('Comafi');
  });
});
