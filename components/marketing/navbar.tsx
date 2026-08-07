import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-extrabold text-primary-foreground">
            T
          </div>
          <span className="text-lg font-extrabold tracking-tight">tlabli</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground sm:flex">
          <Link href="/templates" className="transition-colors hover:text-foreground">
            Templates
          </Link>
          <Link href="/#features" className="transition-colors hover:text-foreground">
            Features
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
          <Link href="/#faq" className="transition-colors hover:text-foreground">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/onboarding">Start free</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
