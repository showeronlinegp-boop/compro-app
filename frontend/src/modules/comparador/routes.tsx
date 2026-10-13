import { useNavigate } from 'react-router-dom';
import { useComparador } from './ComparadorProvider';
import Explorar from './pages/Explorar';
import Intereses from './pages/Intereses';
import Onboarding from './pages/Onboarding';

// Wrappers de ruta: leen el context del comparador y le pasan a cada página
// exactamente las mismas props que antes le pasaba `AppShell` (C1, C3).
// `Planner`, `Cart` y `Compare` no reciben props y van directo en el manifest.

export function ExplorarRoute() {
  const { interests, toggleInterest, addToShopping, syncStatus, enrichStatus, enrichDone, promos } =
    useComparador();
  return (
    <Explorar
      interests={interests}
      onToggleInterest={toggleInterest}
      onAddToShopping={addToShopping}
      syncStatus={syncStatus}
      enrichStatus={enrichStatus}
      enrichDoneKeys={enrichDone}
      promos={promos}
    />
  );
}

export function InteresesRoute() {
  const { interests, toggleInterest, addToShopping, shoppingIds } = useComparador();
  return (
    <Intereses
      interests={interests}
      onToggleInterest={toggleInterest}
      onAddToShopping={addToShopping}
      shoppingIds={shoppingIds}
    />
  );
}

export function OnboardingRoute() {
  const navigate = useNavigate();
  const { setProfile } = useComparador();
  return (
    <Onboarding
      onComplete={(p) => {
        setProfile(p);
        navigate('/planner', { replace: true });
      }}
    />
  );
}
