import { useState } from 'react';
import { Button } from '../../host/ui/Button';
import { IconClients } from '../../host/ui/icons';

/** Lo que devuelve la Contact Picker API (Chrome en Android). */
interface ContactoElegido {
  name?: string[];
  tel?: string[];
}

interface ContactsManager {
  select(
    props: Array<'name' | 'tel'>,
    opts?: { multiple?: boolean },
  ): Promise<ContactoElegido[]>;
}

export interface DatosContacto {
  nombre: string;
  telefono: string;
}

function selector(): ContactsManager | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null;
  if (!('contacts' in navigator) || !('ContactsManager' in window)) return null;
  return (navigator as Navigator & { contacts: ContactsManager }).contacts;
}

/** Hay selector de contactos (Chrome en Android). En iPhone y en la compu, no. */
export function hayContactos(): boolean {
  return selector() !== null;
}

/**
 * Nombre y teléfono del contacto, recortados a lo que acepta el backend.
 * El teléfono va tal cual (con +54, espacios o guiones): el backend ya lo
 * normaliza para WhatsApp. Con varios números, el primero que tenga.
 */
export function datosDeContacto(c: ContactoElegido | undefined): DatosContacto | null {
  if (!c) return null;
  const nombre = (c.name ?? []).map((n) => n.trim()).find(Boolean) ?? '';
  const telefono = (c.tel ?? []).map((t) => t.trim()).find(Boolean) ?? '';
  if (!nombre && !telefono) return null;
  return { nombre: nombre.slice(0, 80), telefono: telefono.slice(0, 30) };
}

/**
 * "Elegir de mis contactos" (plan de adopción, fase 1, punto 3): trae nombre y
 * teléfono de la agenda del celu. Sin soporte no se muestra. Si la persona
 * cierra la agenda sin elegir, no pasa nada.
 */
export function BotonContactos({ onElegir }: { onElegir: (datos: DatosContacto) => void }) {
  const [abriendo, setAbriendo] = useState(false);
  const contactos = selector();
  if (!contactos) return null;

  async function elegir() {
    if (!contactos || abriendo) return;
    setAbriendo(true);
    try {
      const [c] = await contactos.select(['name', 'tel'], { multiple: false });
      const datos = datosDeContacto(c);
      if (datos) onElegir(datos);
    } catch {
      // Cerró la agenda o no dio permiso: se sigue escribiendo a mano.
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="m" block onClick={elegir} disabled={abriendo}>
      <IconClients size={20} />
      Elegir de mis contactos
    </Button>
  );
}
