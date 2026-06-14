import { BadRequestException, Controller, Inject, Post, Query } from '@nestjs/common';
import { SUPERS } from '../../../config/supers.js';
import { CART_REPO } from '../../../common/tokens.js';
import { buildVtexCart } from '../domain/cart.js';
import type { CartRepo } from './cart.repo.js';
import type { SuperKey } from '../../../shared/types.js';

@Controller('api/cart')
export class CartController {
  constructor(@Inject(CART_REPO) private readonly repo: CartRepo) {}

  @Post('build')
  async build(@Query('super') superKey: string) {
    if (!superKey || !(superKey in SUPERS)) {
      throw new BadRequestException(`super inválido: ${superKey}`);
    }

    const cfg = SUPERS[superKey as SuperKey];
    const { found, missing } = await this.repo.getItemsForSuper(superKey);

    if (found.length === 0) {
      throw new BadRequestException('No se encontraron productos para este supermercado');
    }

    const orderFormId = await buildVtexCart(cfg.baseUrl, found);
    const url = `${cfg.baseUrl}/checkout/#/orderForm/${orderFormId}`;

    return {
      url,
      items_added: found.length,
      items_missing: missing.length,
      missing_names: missing,
    };
  }
}
