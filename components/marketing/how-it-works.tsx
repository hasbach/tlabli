import { LayoutTemplate, UtensilsCrossed, QrCode } from "lucide-react";

const steps = [
  {
    icon: LayoutTemplate,
    title: "1. Pick your template",
    description: "Choose the look that fits your business — fast food, bakery, fine dining or café. Switch anytime.",
  },
  {
    icon: UtensilsCrossed,
    title: "2. Add your menu",
    description: "Categories, photos, prices, add-ons — in $ and L.L. Mark items sold out with one tap.",
  },
  {
    icon: QrCode,
    title: "3. Share your link & QR",
    description: "Post it on Instagram, print it on tables, or send it on WhatsApp. Orders arrive on your phone.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">From zero to online in one sitting</h2>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
          No account manager, no onboarding call. Most owners finish setup in under 15 minutes.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <step.icon className="h-6 w-6" />
            </div>
            <h3 className="font-bold">{step.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
