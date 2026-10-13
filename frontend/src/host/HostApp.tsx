import { Route, Routes } from 'react-router-dom';
import { HostLayout } from './HostLayout';
import { ModuleProviders } from './ModuleProviders';
import { MorePage } from './MorePage';
import SignInPage from './auth/SignInPage';
import SignUpPage from './auth/SignUpPage';
import { type AppModule, HOST_MORE_PATH, type HostTool } from './contract';
import { ActiveModuleProvider } from './nav/ActiveModule';
import { NavItemsProvider } from './nav/NavItemsProvider';
import { ModuleRoutes } from './routing';
import { hostTools } from './tools';
import { ToastProvider } from './ui/Toast';

interface HostAppProps {
  /** Módulos a montar; `App.tsx` pasa el `registry`, los tests pasan módulos falsos. */
  modules: readonly AppModule[];
  /** Herramientas globales; por defecto `hostTools`. */
  tools?: readonly HostTool[];
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
