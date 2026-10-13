import type { ReactNode } from 'react';
import { AccountMenu } from './auth/AccountMenu';
import type { AppModule, HostTool } from './contract';
import { chromeOf } from './location';
import { useActiveModule } from './nav/ActiveModule';
import { BottomNav } from './nav/BottomNav';
import { HostToolsOutlet, hostTools } from './tools';
import { ToastViewport } from './ui/Toast';

interface HostLayoutProps {
  modules: readonly AppModule[];
  tools?: readonly HostTool[];
  children: ReactNode;
}

/**
 * Shell mobile del host (guía §3): columna de máx. 480 px y alto `100dvh`.
 * `main` es el único contenedor que scrollea. Arriba, una barra compacta sólo
 * en rutas de un módulo con `headerActions`; abajo, la BottomNav salvo en
 * pantallas de tarea (chrome 'task'). Overlays, toast y tools van por encima.
 */
export function HostLayout({ modules, tools = hostTools, children }: HostLayoutProps) {
  const { location } = useActiveModule();
  const chrome = chromeOf(location);
  const HeaderActions = location?.module.slots?.headerActions;
  const withBottomNav = chrome === 'full';

  return (
    <div className="relative mx-auto flex h-[100dvh] w-full max-w-app flex-col overflow-hidden bg-bg text-ink font-body text-body">
      {HeaderActions && (
        <header className="flex-none pt-safe bg-surface border-b border-line">
          <div className="flex items-center gap-2 h-14 px-4">
            <span className="font-display text-title-s text-ink flex-none">Neggo</span>
            <div className="flex-1" aria-hidden="true" />
            <HeaderActions />
            <AccountMenu />
          </div>
        </header>
      )}

      <main
        className={`flex-1 overflow-y-auto overscroll-contain ${HeaderActions ? '' : 'pt-safe'}`}
      >
        {children}
      </main>

      {/* Overlays de los módulos (p. ej. CartDrawer) — sobre todas las rutas */}
      {modules.map(({ id, slots }) => {
        const Overlays = slots?.overlays;
        return Overlays ? <Overlays key={id} /> : null;
      })}

      {withBottomNav && <BottomNav />}

      <ToastViewport withBottomNav={withBottomNav} />

      <HostToolsOutlet tools={tools} />
    </div>
  );
}
