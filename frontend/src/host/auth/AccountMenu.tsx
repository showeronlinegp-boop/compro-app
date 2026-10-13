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
            className={`text-xs font-medium px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors ${FOCUS_RING}`}
          >
            Ingresar
          </button>
        </SignInButton>
      </SignedOut>
    </>
  );
}
