import { BadRequestException, Controller, Inject, Post, Query } from '@nestjs/common';
import { SUPERS } from '../../../config/supers.js';
import { CART_REPO } from '../../../common/tokens.js';
import { buildCartAddUrl } from '../domain/cart.js';
import type { CartRepo } from './cart.repo.js';
import type { SuperKey } from '../../../shared/types.js';

// DIA requires login before cart — warn the user but still build the URL.
const REQUIRES_LOGIN: Partial<Record<SuperKey, string>> = {
  dia: 'DIA requiere que inicies sesión en su sitio antes de ver el carrito.',
};

// VEA requires store selection (geo-dependent inventory) — items may not load without it.
const REQUIRES_STORE: Partial<Record<SuperKey, string>> = {
  vea: 'VEA requiere seleccionar una sucursal. Algunos ítems pueden no estar disponibles sin esa selección.',
};

@Controller('api/cart')
export class CartController {
  constructor(@Inject(CART_REPO) private readonly repo: CartRepo) {}

  @Post('build')
  async build(@Query('super') superKey: string) {
    if (!superKey || !(superKey in SUPERS)) {
      throw new BadRequestException(`super inválido: ${superKey}`);
    }

    const cfg = SUPERS[superKey as SuperKey];
    const { found, missing } = await this.repo.getRecommendedItemsForSuper(superKey);

    if (found.length === 0) {
      throw new BadRequestException(
        `${cfg.label} no tiene el precio más bajo en ningún ítem de tu lista`,
      );
    }

    const url = buildCartAddUrl(cfg.baseUrl, found);
    const warning = REQUIRES_LOGIN[superKey as SuperKey] ?? REQUIRES_STORE[superKey as SuperKey] ?? null;

    return {
      url,
      items_added: found.length,
      items_missing: missing.length,
      missing_names: missing,
      warning,
    };
  }
}
