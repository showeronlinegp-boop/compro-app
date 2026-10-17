/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Link de "Pedir a Neggo" en el inicio de Fiado; sin él la tarjeta no se muestra. */
  readonly VITE_NEGGO_PEDIDOS_URL?: string;
  /** 'true' fuerza el comparador en un build de producción (en dev siempre está). */
  readonly VITE_ENABLE_COMPARADOR?: string;
}
