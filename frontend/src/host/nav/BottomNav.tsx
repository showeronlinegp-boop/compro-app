import { NavLink } from 'react-router-dom';
import { FOCUS_RING } from '../ui/styles';
import { useNavItems } from './NavItemsProvider';

/**
 * Bottom tab bar — primary navigation on small screens (the inline top-bar
 * links are hidden < lg). Keeps the top bar from overflowing the viewport.
 */
export function BottomNav() {
  const items = useNavItems();
  return (
    <nav
      aria-label="Navegación inferior"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100"
    >
      <div className="flex items-stretch">
        {items.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${FOCUS_RING} ${
                isActive ? 'text-indigo-700' : 'text-gray-500'
              }`
            }
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
