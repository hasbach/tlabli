import Link from "next/link";
import { ArrowRight, MessageCircle, Coins, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 sm:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[420px] max-w-4xl rounded-full opacity-25 blur-3xl"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--secondary))" }}
      />

      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium shadow-soft animate-fade-up">
          Built for Lebanon&apos;s restaurants, snack shops &amp; bakeries
        </div>

        <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl animate-fade-up">
          A gorgeous digital menu, live in minutes —{" "}
          <span className="text-primary">no designer, no dev, no big budget.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground animate-fade-up">
          Pick a template, add your dishes, share your link or QR code. New orders land straight in your WhatsApp —
          exactly how you already run your business.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up">
          <Button size="lg" asChild>
            <Link href="/onboarding">
              Start free — no card needed <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/templates">Browse templates</Link>
          </Button>
        </div>

        <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4 text-primary" /> Orders via WhatsApp
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Coins className="h-4 w-4 text-primary" /> $ and L.L. pricing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Languages className="h-4 w-4 text-primary" /> Arabic, English &amp; French
          </span>
        </div>
      </div>
    </section>
  );
}
