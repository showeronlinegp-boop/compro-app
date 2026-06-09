# VTEX Fixtures

These files are raw response bodies recorded from live VTEX endpoints.
They are the **behavior contract** for the characterization tests in Slice 4+.

## How to (re-)record

```bash
cd backend
npx tsx scripts/record-fixtures.ts
```

All fixtures are written to this directory.

## When to re-record

Only deliberately, when VTEX API shapes drift (e.g. a field is renamed or
the response structure changes). Never re-record silently — the snapshot
diffs are the signal that behavior changed.

## Files

| Pattern | Endpoint | Notes |
|---------|----------|-------|
| `is-search-<super>-<path>-p<n>.json` | IS `product_search` | First 5 products per page, 2 pages |
| `catalog-tree-<super>.json` | `catalog_system/pub/category/tree/2` | Full tree |
| `variations-<super>-<productId>.json` | `catalog_system/pub/products/variations/:id` | 3 samples per super |
| `promotions-vea.json` | `_v/search-promotions` POST | vea only (promoSeller) |
| `jsonld-<super>-<productId>.html` | Product HTML page | JSON-LD blocks trimmed, carrefour + dia |
