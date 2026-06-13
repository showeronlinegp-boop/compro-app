/**
 * Injection token constants for NestJS DI.
 * Used by useFactory providers to avoid class-name coupling.
 */
export const CATALOG_REPO = 'CATALOG_REPO' as const;
export const INTERESTS_REPO = 'INTERESTS_REPO' as const;
export const SHOPPING_REPO = 'SHOPPING_REPO' as const;
export const PROMOS_REPO = 'PROMOS_REPO' as const;
export const CRAWLER_SERVICE = 'CRAWLER_SERVICE' as const;
export const ENRICH_SERVICE = 'ENRICH_SERVICE' as const;
export const PROMO_CAPTURE_SERVICE = 'PROMO_CAPTURE_SERVICE' as const;
