import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { mensajeDeError } from './api';

export interface Carga<T> {
  data: T | null;
  error: string | null;
  cargando: boolean;
  /** Vuelve a pedir los datos (p. ej. después de anotar un movimiento). */
  recargar: () => void;
}

/**
 * Carga datos de la API para una pantalla. Ignora respuestas viejas si las
 * dependencias cambian antes de que lleguen (búsqueda mientras se tipea).
 */
export function useCarga<T>(fetcher: () => Promise<T>, deps: DependencyList): Carga<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps las define quien llama; tick fuerza la recarga
  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    setCargando(true);
    fetcher()
      .then((d) => {
        if (mine !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (mine !== seq.current) return;
        setError(mensajeDeError(e));
      })
      .finally(() => {
        if (mine === seq.current) setCargando(false);
      });
  }, [...deps, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, cargando, recargar };
}
