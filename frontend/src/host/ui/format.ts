/**
 * Formato de dinero argentino (guía §2.2). Única función para mostrar plata:
 * `$ 42.300`, espacio después del signo, punto de miles y decimales sólo si
 * existen (`$ 1.249,90`). Siempre muestra el valor absoluto: el signo `+`/`−`
 * lo pone quien llama, porque su significado depende del contexto.
 */
export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100) % 100;
  const text =
    cents === 0
      ? Math.round(abs).toLocaleString('es-AR')
      : abs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$ ${text}`;
}

/** Monto con signo explícito: `+ $ 4.200` / `− $ 4.200` (U+2212, no guion). */
export function formatSignedMoney(n: number): string {
  if (n === 0) return formatMoney(0);
  return `${n > 0 ? '+' : '−'} ${formatMoney(n)}`;
}
