/** Target URLs and extraction kind for each promo super. */

export interface PromoTarget {
  url: string;
  kind: 'valtech' | 'vea' | 'dia';
  classPrefix?: string;
}

export const PROMO_TARGETS: Record<string, PromoTarget> = {
  carrefour: {
    url: 'https://www.carrefour.com.ar/descuentos-bancarios',
    kind: 'valtech',
    classPrefix: 'valtech-carrefourar-bank-promotions-0-x-',
  },
  masonline: {
    url: 'https://www.masonline.com.ar/promociones-bancarias',
    kind: 'valtech',
    classPrefix: 'valtech-gdn-banks-promotions-0-x-',
  },
  vea: {
    url: 'https://www.vea.com.ar/descuentos-del-dia',
    kind: 'vea',
  },
  dia: {
    url: 'https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones',
    kind: 'dia',
    classPrefix: 'diaio-custom-bank-promotions-0-x-',
  },
};
