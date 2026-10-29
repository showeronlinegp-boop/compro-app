import { createClerkClient } from '@clerk/backend';
import type { Ingreso } from '../domain/uso.js';

/** Último ingreso de cada Clerk user ID pedido; los que Clerk no conoce no aparecen. */
export type ClerkIngresos = (clerkUserIds: readonly string[]) => Promise<Map<string, Ingreso>>;

/** Máximo que acepta GET /users de Clerk por página. */
const PAGINA = 500;

export function makeClerkIngresos(secretKey: string): ClerkIngresos {
  return async (ids) => {
    const clerk = createClerkClient({ secretKey });
    const out = new Map<string, Ingreso>();
    for (let i = 0; i < ids.length; i += PAGINA) {
      const { data } = await clerk.users.getUserList({
        userId: ids.slice(i, i + PAGINA),
        limit: PAGINA,
      });
      for (const u of data) {
        out.set(u.id, {
          last_active_at: u.lastActiveAt ? new Date(u.lastActiveAt) : null,
          last_sign_in_at: u.lastSignInAt ? new Date(u.lastSignInAt) : null,
        });
      }
    }
    return out;
  };
}
