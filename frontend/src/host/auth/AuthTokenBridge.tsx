import { useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { setTokenGetter } from '../../modules/comparador/api';

/**
 * AuthTokenBridge — registers Clerk's getToken with api.ts so every fetch can
 * pull a fresh token at request time. Registering a getter (instead of pushing
 * a resolved token) removes the mount-time race where a data fetch fires before
 * the token has been set, and lets Clerk handle caching/refresh internally.
 * getToken() returns null when signed out, so public requests carry no auth.
 *
 * Placed inside <ClerkProvider> so useAuth() is available; renders nothing.
 */
export function AuthTokenBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);

  return null;
}
