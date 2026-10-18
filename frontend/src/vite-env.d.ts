/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Link de "Pedir a Neggo" en el inicio de Fiado; sin él la tarjeta no se muestra. */
  readonly VITE_NEGGO_PEDIDOS_URL?: string;
  /** 'true' fuerza el comparador en un build de producción (en dev siempre está). */
  readonly VITE_ENABLE_COMPARADOR?: string;
  /** '1' monta las notas de prueba. Solo en dev (`.env.development.local`); en build no existe. */
  readonly VITE_TEST_NOTES?: string;
}
