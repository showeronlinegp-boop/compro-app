import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';
import { FOCUS_RING } from '../ui/styles';

/**
 * User account menu when signed in; a sign-in button otherwise.
 * Browsing is public — auth only gates user-specific features.
 */
export function AccountMenu() {
  return (
    <>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className={`pressable min-h-touch px-3 rounded-m bg-ink text-surface text-body-s font-bold ${FOCUS_RING}`}
          >
            Ingresar
          </button>
        </SignInButton>
      </SignedOut>
    </>
  );
}
