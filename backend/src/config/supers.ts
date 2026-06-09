import type { SuperConfig, SuperKey } from '../shared/types.js';

export const SUPERS: Record<SuperKey, SuperConfig> = {
  vea: { baseUrl: 'https://www.vea.com.ar', promoSeller: 'jumboargentinav700cordoba700' },
  masonline: { baseUrl: 'https://www.masonline.com.ar' },
  carrefour: { baseUrl: 'https://www.carrefour.com.ar' },
  dia: { baseUrl: 'https://diaonline.supermercadosdia.com.ar' },
};
