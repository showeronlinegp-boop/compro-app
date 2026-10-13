import { useComparador } from '../ComparadorProvider';
import { LocationSelector } from './LocationSelector';

/** Location selector del header: lee `profile` del comparador y lo actualiza al guardar (C4). */
export function LocationSlot() {
  const { profile, setProfile } = useComparador();
  return (
    <LocationSelector location={profile?.postal_code ?? null} onSaved={(p) => setProfile(p)} />
  );
}
