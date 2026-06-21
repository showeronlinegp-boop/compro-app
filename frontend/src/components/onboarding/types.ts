import type { TierValue } from '../../types/api';

export type TierOrPriceDriven = TierValue | 'price_driven';

export interface FormState {
  // Step 1
  nombre: string;
  edad: string;
  genero: string;
  // Step 2
  hogar_tamano: number;
  tiene_chicos: boolean;
  tipo_chicos: string[];
  hogar_adultos_mayores: boolean;
  mascotas: string[];
  // Step 3
  pref_almacen_1: TierOrPriceDriven | '';
  pref_lacteos: TierOrPriceDriven | '';
  pref_almacen_2: TierOrPriceDriven | '';
  pref_bebidas: TierOrPriceDriven | '';
  pref_limpieza: TierOrPriceDriven | '';
  pref_personal: TierOrPriceDriven | '';
}
