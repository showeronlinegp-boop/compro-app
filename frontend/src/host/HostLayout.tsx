import type { ReactNode } from 'react';
import { AccountMenu } from './auth/AccountMenu';
import type { AppModule, HostTool } from './contract';
import { chromeOf, useHostLocation } from './location';
import { BottomNav } from './nav/BottomNav';
import { TopNav } from './nav/TopNav';
import { HostToolsOutlet, hostTools } from './tools';

interface HostLayoutProps {
  modules: readonly AppModule[];
  tools?: readonly HostTool[];
  children: ReactNode;
}

/**
 * Layout del host: header (marca, TopNav, spacer, headerActions, cuenta),
 * main, overlays, BottomNav y HostToolsOutlet. Con chrome 'task' (H8) sólo
 * desaparece la BottomNav y el padding inferior que la reserva.
 */
export function HostLayout({ modules, tools = hostTools, children }: HostLayoutProps) {
  const chrome = chromeOf(useHostLocation());

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav
        aria-label="Principal"
        className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40"
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 flex items-center h-14 gap-3 sm:gap-6">
          <span className="font-bold text-gray-900 text-base tracking-tight flex-shrink-0">
            🛒 COMPRO
          </span>

          {/* Primary nav: inline on lg+. On smaller screens it moves to a bottom
              tab bar (see BottomNav) so the top bar never overflows the viewport. */}
          <TopNav />

          {/* Spacer pushes the right-side controls to the edge on mobile, where the
              inline nav links are hidden (they live in the bottom tab bar instead). */}
          <div className="flex-1 lg:hidden" aria-hidden="true" />

          {modules.map(({ id, slots }) => {
            const HeaderActions = slots?.headerActions;
            return HeaderActions ? <HeaderActions key={id} /> : null;
          })}

          <AccountMenu />
        </div>
      </nav>

      {/* Content — bottom padding on mobile clears the fixed bottom tab bar */}
      <main className={chrome === 'task' ? 'flex-1' : 'flex-1 pb-16 lg:pb-0'}>{children}</main>

      {/* Overlays de los módulos (p. ej. CartDrawer) — sobre todas las rutas */}
      {modules.map(({ id, slots }) => {
        const Overlays = slots?.overlays;
        return Overlays ? <Overlays key={id} /> : null;
      })}

      {chrome === 'full' && <BottomNav />}

      <HostToolsOutlet tools={tools} />
    </div>
  );
}
