import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="px-6 py-16">
      <div
        className="mx-auto max-w-4xl rounded-3xl px-8 py-14 text-center shadow-soft"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--secondary))" }}
      >
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Your menu could be live before your next delivery rush.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-white/90">
          Free to start. No design skills, no dev team, no big budget — just your dishes and your phone.
        </p>
        <Button size="lg" variant="secondary" className="mt-7" asChild>
          <Link href="/onboarding">
            Build my menu now <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
