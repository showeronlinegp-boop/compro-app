import { Route, Routes } from 'react-router-dom';
import { HostLayout } from './HostLayout';
import { ModuleProviders } from './ModuleProviders';
import SignInPage from './auth/SignInPage';
import SignUpPage from './auth/SignUpPage';
import type { AppModule, HostTool } from './contract';
import { NavItemsProvider } from './nav/NavItemsProvider';
import { ModuleRoutes } from './routing';
import { hostTools } from './tools';

interface HostAppProps {
  /** Módulos a montar; `App.tsx` pasa el `registry`, los tests pasan módulos falsos. */
  modules: readonly AppModule[];
  /** Herramientas globales; por defecto `hostTools` (vacía en este cambio). */
  tools?: readonly HostTool[];
}

/**
 * Raíz del host: rutas de Clerk fuera del layout y, para todo lo demás,
 * Providers de todos los módulos > NavItemsProvider > HostLayout > rutas.
 */
export function HostApp({ modules, tools = hostTools }: HostAppProps) {
  return (
    <Routes>
      {/* Clerk-hosted auth routes */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Everything else renders for everyone — browsing is public.
          User-specific routes are gated individually (auth: 'required'). */}
      <Route
        path="/*"
        element={
          <ModuleProviders modules={modules}>
            <NavItemsProvider modules={modules}>
              <HostLayout modules={modules} tools={tools}>
                <ModuleRoutes modules={modules} />
              </HostLayout>
            </NavItemsProvider>
          </ModuleProviders>
        }
      />
    </Routes>
  );
}
