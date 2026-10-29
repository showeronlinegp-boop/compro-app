import { useEffect, useState } from 'react';
import { adminApi } from './api';

/** Se pregunta una sola vez por carga de la app (no cambia sin volver a entrar). */
let consulta: Promise<boolean> | null = null;

/** ¿La cuenta actual es admin? Mientras no se sabe, false (la opción no aparece). */
export function useEsAdmin(): boolean {
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => {
    let vigente = true;
    consulta ??= adminApi.acceso();
    void consulta.then((v) => vigente && setEsAdmin(v));
    return () => {
      vigente = false;
    };
  }, []);
  return esAdmin;
}

/** Sólo tests: olvida la respuesta. */
export function reiniciarEsAdmin() {
  consulta = null;
}
