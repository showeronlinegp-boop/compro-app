import { RedirectToSignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import type { ReactNode } from 'react';

/**
 * Gates a single route: renders its children when signed in, otherwise sends
 * the user to Clerk's sign-in. Used only for user-specific pages — browsing
 * the catalog is public and never wrapped in this.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
