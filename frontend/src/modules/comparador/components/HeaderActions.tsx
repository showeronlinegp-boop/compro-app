import { useComparador } from '../ComparadorProvider';
import { CartButton } from './CartButton';
import { LocationSlot } from './LocationSlot';
import { SyncPanel } from './SyncPanel';

/**
 * `slots.headerActions` del comparador (C4): en el header del host, entre el
 * spacer y la cuenta. Mismo orden que antes: carrito, ubicación, sync.
 */
export function HeaderActions() {
  const { syncStatus } = useComparador();
  return (
    <>
      {/* Cart — opens the cart drawer */}
      <CartButton />

      {/* Location selector */}
      <LocationSlot />

      {/* Sync status panel (read-only; triggers moved to ops CLI) */}
      <SyncPanel status={syncStatus} />
    </>
  );
}
