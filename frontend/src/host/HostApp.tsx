import { Navigate, Route, Routes } from 'react-router-dom';
import { HostLayout } from './HostLayout';
import { ModuleProviders } from './ModuleProviders';
import { MorePage } from './MorePage';
import PrivacidadPage from './PrivacidadPage';
import SignInPage from './auth/SignInPage';
import SignUpPage from './auth/SignUpPage';
import { type AppModule, HOST_MORE_PATH, type HostTool } from './contract';
import { ActiveModuleProvider } from './nav/ActiveModule';
import { NavItemsProvider } from './nav/NavItemsProvider';
import { type HostRoute, ModuleRoutes, flattenRoutes } from './routing';
import { hostTools } from './tools';
import { ToastProvider } from './ui/Toast';

interface HostAppProps {
  /** Módulos a montar; `App.tsx` pasa el `registry`, los tests pasan módulos falsos. */
  modules: readonly AppModule[];
  /** Herramientas globales; por defecto `hostTools`. */
  tools?: readonly HostTool[];
}

/**
 * Si ningún módulo ocupa '/' (p. ej. producción sin comparador), '/' manda al
 * primer módulo. Así los links y el sign-out que apuntan a '/' no quedan en blanco.
 */
function rootRedirect(modules: readonly AppModule[]): HostRoute[] {
  const [first] = modules;
  if (!first || flattenRoutes(modules).some((r) => r.fullPath === '/')) return [];
  return [{ path: '/', element: <Navigate to={first.basePath} replace /> }];
}

/**
 * Raíz del host: rutas de Clerk fuera del layout y, para todo lo demás,
 * Toast > Providers de todos los módulos > NavItemsProvider >
 * ActiveModuleProvider > HostLayout > rutas (de módulos y del host).
 */
export function HostApp({ modules, tools = hostTools }: HostAppProps) {
  return (
    <Routes>
      {/* Clerk-hosted auth routes */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      {/* Pública y sin links desde la app: sólo se llega por URL (la pide Google). */}
      <Route path="/privacidad" element={<PrivacidadPage />} />

      {/* Everything else renders for everyone — browsing is public.
          User-specific routes are gated individually (auth: 'required'). */}
      <Route
        path="/*"
        element={
          <ToastProvider>
            <ModuleProviders modules={modules}>
              <NavItemsProvider modules={modules}>
                <ActiveModuleProvider modules={modules}>
                  <HostLayout modules={modules} tools={tools}>
                    <ModuleRoutes
                      modules={modules}
                      hostRoutes={[
                        { path: HOST_MORE_PATH, element: <MorePage modules={modules} /> },
                        ...rootRedirect(modules),
                      ]}
                    />
                  </HostLayout>
                </ActiveModuleProvider>
              </NavItemsProvider>
            </ModuleProviders>
          </ToastProvider>
        }
      />
    </Routes>
  );
}
