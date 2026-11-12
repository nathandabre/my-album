import Link from "next/link";
import { Camera, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-2xl bg-muted p-4 text-muted-foreground mb-4">
        <Camera className="h-10 w-10 text-foreground" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Page or Album Not Found
      </h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">
        The link you followed might be broken, or the album may have been deleted or made private.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Home
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button>Go to Dashboard</Button>
        </Link>
      </div>
    </main>
  );
}

