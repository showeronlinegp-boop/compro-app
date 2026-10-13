import { NavLink } from 'react-router-dom';
import { HOST_MORE_PATH, MAX_BOTTOM_ITEMS, type NavItem } from '../contract';
import { IconMore } from '../ui/icons';
import { FOCUS_RING } from '../ui/styles';
import { useActiveModule } from './ActiveModule';

/** Parte los items del módulo: los primeros van a la barra, el resto a "Más". */
export function splitNavItems(items: readonly NavItem[]): {
  bar: NavItem[];
  overflow: NavItem[];
} {
  return { bar: items.slice(0, MAX_BOTTOM_ITEMS), overflow: items.slice(MAX_BOTTOM_ITEMS) };
}

const itemClass = (isActive: boolean) =>
  `pressable relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-micro font-bold ${FOCUS_RING} ${
    isActive ? 'text-ink' : 'text-ink-disabled'
  }`;

/**
 * Barra inferior (guía §4.13): hasta 3 items del módulo activo + "Más" del
 * host. Alto 74 px más el safe area; ícono 24 px + texto 13/700.
 */
export function BottomNav() {
  const { items } = useActiveModule();
  const { bar } = splitNavItems(items);
  return (
    <nav
      aria-label="Navegación inferior"
      className="flex-none bg-surface border-t border-border-strong pb-safe"
    >
      <div className="h-nav flex items-stretch">
        {bar.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) => itemClass(isActive)}
          >
            <span className="relative leading-none" aria-hidden="true">
              {item.icon}
              {item.badge ? (
                <span className="absolute -top-1 -right-3 min-w-[18px] h-[18px] px-1 rounded-pill bg-ink text-surface text-[12px] leading-[18px] text-center">
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span className="truncate max-w-full px-1">
              {item.label}
              {item.badge ? <span className="sr-only"> ({item.badge})</span> : null}
            </span>
          </NavLink>
        ))}
        <NavLink to={HOST_MORE_PATH} className={({ isActive }) => itemClass(isActive)}>
          <span className="leading-none" aria-hidden="true">
            <IconMore />
          </span>
          <span>Más</span>
        </NavLink>
      </div>
    </nav>
  );
}
