import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-base font-extrabold text-primary-foreground">
            T
          </div>
          <span className="font-extrabold tracking-tight">tlabli</span>
          <span className="text-sm text-muted-foreground">— made for Lebanese F&amp;B owners</span>
        </div>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <Link href="/templates" className="hover:text-foreground">
            Templates
          </Link>
          <Link href="/#pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Tlabli</p>
      </div>
    </footer>
  );
}
