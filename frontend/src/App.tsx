import { HostApp } from './host/HostApp';
import { AuthTokenBridge } from './host/auth/AuthTokenBridge';
import { registry } from './host/registry';

export default function App() {
  return (
    <>
      {/* AuthTokenBridge registers Clerk's getToken with the host HTTP core.
          It renders null and must live inside <ClerkProvider> (set in main.tsx). */}
      <AuthTokenBridge />
      <HostApp modules={registry} />
    </>
  );
}
