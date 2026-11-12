import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Suspense fallback={<div className="h-96 w-80 animate-pulse rounded-lg bg-muted" />}>
        <SignUp fallbackRedirectUrl="/dashboard" />
      </Suspense>
    </main>
  );
}

