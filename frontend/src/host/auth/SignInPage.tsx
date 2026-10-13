import { SignIn } from '@clerk/clerk-react';

export default function SignInPage() {
  return (
    <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-4">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </div>
  );
}
