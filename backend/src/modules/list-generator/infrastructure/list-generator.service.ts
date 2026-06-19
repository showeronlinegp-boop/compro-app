import type { UserProfile } from '../../../shared/types.js';
import { calcQtyFinal, shouldIncludeItem } from '../domain/generator.js';
import type { ListGeneratorRepo } from './list-generator.repo.js';

export interface ListGeneratorService {
  generateForProfile(profile: UserProfile): Promise<{ generated: number }>;
}

export function makeListGeneratorService(repo: ListGeneratorRepo): ListGeneratorService {
  return {
    async generateForProfile(profile) {
      await repo.clearGeneratedItems();
      const templateItems = await repo.getTemplateItems(profile.perfil_hogar);
      const eligible = templateItems.filter((item) => shouldIncludeItem(item, profile));

      const toAdd: Array<{ product_id: number; frequency_days: number; notes: string }> = [];

      for (const item of eligible) {
        const tier = (profile.tier_por_categoria[item.category_key] as number) ?? 2;
        const priceDriven = profile.price_driven?.includes(item.category_key) ?? false;
        const nameHint = item.search_keyword ?? (item.item_name.split(' ')[0] ?? item.item_name);

        const productId = await repo.findBestProductId({
          categoryKey: item.category_key,
          tier,
          priceDriven,
          nameHint,
          sizeHint: item.size_hint,
          rules: {
            incluye: item.incluye,
            requiere_alguno: item.requiere_alguno,
            excluye: item.excluye,
            veta: item.veta,
          },
        });
        if (!productId) continue;

        const qty = calcQtyFinal(item, profile.hogar_tamano);
        toAdd.push({
          product_id: productId,
          frequency_days: item.frequency_days,
          notes: `${item.item_name} x${qty}`,
        });
      }

      const generated = await repo.bulkAddToShopping(toAdd);
      return { generated };
    },
  };
}
