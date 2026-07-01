import { useAuth } from '@clerk/clerk-react';
import { useEffect, useRef } from 'react';
import { setApiToken } from '../api';

/**
 * AuthTokenBridge — syncs the Clerk session token into api.ts without
 * causing tree-wide re-renders. The token is stored in a module-level
 * variable (not React state) so every fetch automatically carries the
 * latest Authorization header with zero extra renders.
 *
 * Placed inside <ClerkProvider> so useAuth() is available; placed at the
 * app root so it runs before any data-fetching component mounts.
 */
export function AuthTokenBridge() {
  const { getToken, isSignedIn } = useAuth();
  // Use a ref to hold the refresh interval ID so it doesn't trigger re-renders.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setApiToken(null);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Fetch immediately on sign-in.
    void getToken().then(setApiToken);

    // Refresh every 50 seconds — Clerk tokens expire at 60 s by default.
    intervalRef.current = setInterval(() => {
      void getToken().then(setApiToken);
    }, 50_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSignedIn, getToken]);

  return null;
}
