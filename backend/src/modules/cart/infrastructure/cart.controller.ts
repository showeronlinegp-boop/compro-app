import { BadRequestException, Controller, Inject, Post, Query } from '@nestjs/common';
import { SUPERS } from '../../../config/supers.js';
import { CART_REPO } from '../../../common/tokens.js';
import { buildCartAddUrl } from '../domain/cart.js';
import type { CartRepo } from './cart.repo.js';
import type { SuperKey } from '../../../shared/types.js';

// VEA uses click & collect with per-branch inventory — cart/add always returns ORD027
// without a pickup point selected. Not compatible with our cart flow.
const CART_UNSUPPORTED: Partial<Record<SuperKey, string>> = {
  vea: 'VEA funciona por sucursal y no es compatible con el carrito automático.',
};

// DIA requires the user to log in on their site before seeing the cart.
const REQUIRES_LOGIN: Partial<Record<SuperKey, string>> = {
  dia: 'DIA requiere que inicies sesión en su sitio antes de ver el carrito.',
};

@Controller('api/cart')
export class CartController {
  constructor(@Inject(CART_REPO) private readonly repo: CartRepo) {}

  @Post('build')
  async build(@Query('super') superKey: string) {
    if (!superKey || !(superKey in SUPERS)) {
      throw new BadRequestException(`super inválido: ${superKey}`);
    }

    if (CART_UNSUPPORTED[superKey as SuperKey]) {
      throw new BadRequestException(CART_UNSUPPORTED[superKey as SuperKey]);
    }

    const cfg = SUPERS[superKey as SuperKey];
    const { found, missing } = await this.repo.getRecommendedItemsForSuper(superKey);

    if (found.length === 0) {
      throw new BadRequestException(
        `${cfg.label} no tiene el precio más bajo en ningún ítem de tu lista`,
      );
    }

    const url = buildCartAddUrl(cfg.baseUrl, found);
    const warning = REQUIRES_LOGIN[superKey as SuperKey] ?? null;

    return {
      url,
      items_added: found.length,
      items_missing: missing.length,
      missing_names: missing,
      warning,
    };
  }
}
