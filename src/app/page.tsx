import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm tracking-wide text-muted-foreground uppercase">
        Digital albums for photographers
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Create albums. Share a link. Done.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground text-pretty">
        my-album helps photographers upload photo collections and send clients a
        clean, shareable gallery link.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard">
          <Button>Open dashboard</Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="outline">Sign in</Button>
        </Link>
      </div>
    </main>
  );
}
