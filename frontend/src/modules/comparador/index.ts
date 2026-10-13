import type { AppModule } from '../../host/contract';
import { ComparadorProvider } from './ComparadorProvider';
import { CartDrawer } from './components/CartDrawer';
import { HeaderActions } from './components/HeaderActions';
import Cart from './pages/Cart';
import Compare from './pages/Compare';
import Planner from './pages/Planner';
import { ExplorarRoute, InteresesRoute, OnboardingRoute } from './routes';
import { useNav } from './useNav';

/**
 * Manifest del comparador (C1): única declaración de sus rutas, Provider, nav
 * y slots. Montado en '/'. Ninguna ruta declara `chrome` (todas 'full').
 */
export const comparador: AppModule = {
  id: 'comparador',
  label: 'Comparador',
  basePath: '/',
  routes: [
    { id: 'explorar', path: '', component: ExplorarRoute, auth: 'public', title: 'Explorar' },
    {
      id: 'intereses',
      path: 'intereses',
      component: InteresesRoute,
      auth: 'required',
      title: 'Intereses',
    },
    { id: 'planner', path: 'planner', component: Planner, auth: 'required', title: 'Planner' },
    { id: 'cart', path: 'cart', component: Cart, auth: 'required', title: 'Carrito' },
    { id: 'compare', path: 'compare', component: Compare, auth: 'required', title: 'Comparar' },
    {
      id: 'onboarding',
      path: 'onboarding',
      component: OnboardingRoute,
      auth: 'required',
      title: 'Onboarding',
    },
  ],
  Provider: ComparadorProvider,
  useNav,
  slots: { headerActions: HeaderActions, overlays: CartDrawer },
};
