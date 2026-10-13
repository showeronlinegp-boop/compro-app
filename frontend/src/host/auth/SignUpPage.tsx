import { SignUp } from '@clerk/clerk-react';

export default function SignUpPage() {
  return (
    <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-4">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </div>
  );
}
