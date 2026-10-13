import { NavLink } from 'react-router-dom';
import { FOCUS_RING } from '../ui/styles';
import { useNavItems } from './NavItemsProvider';
import { topLabel } from './labels';

/** Nav primaria inline en lg+ (en pantallas chicas vive en la BottomNav). */
export function TopNav() {
  const items = useNavItems();
  return (
    <div className="hidden lg:flex gap-1 flex-1">
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={item.to}
          end={item.end ?? false}
          className={({ isActive }) =>
            `flex-shrink-0 text-sm font-medium px-3 py-1.5 rounded-xl transition-colors ${FOCUS_RING} ${
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`
          }
        >
          {item.iconInTop && item.icon != null && typeof item.icon !== 'string' && (
            <span aria-hidden="true">{item.icon}</span>
          )}
          {topLabel(item)}
        </NavLink>
      ))}
    </div>
  );
}
