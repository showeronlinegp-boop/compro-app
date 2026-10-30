import { type ReactNode, useEffect } from 'react';

/** Piezas compartidas de las páginas legales públicas (privacidad y términos). */

export const RESPONSABLE = 'Mariano Menéndez';
export const CUIT = '20-39963857-8';
export const CONTACTO = 'showeronlinegp@gmail.com';

/** `<meta name="robots" content="noindex">` mientras la página está montada. */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

export function Seccion({
  id,
  titulo,
  children,
}: {
  id?: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-2">
      <h2 className="m-0 font-display text-title-s text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="m-0 text-body text-ink">{children}</p>;
}

export function Lista({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body text-ink">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista estática
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export const mail = (
  <a className="text-ink underline" href={`mailto:${CONTACTO}`}>
    {CONTACTO}
  </a>
);
