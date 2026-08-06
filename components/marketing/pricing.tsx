import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Try it with a real menu, no ordering yet.",
    features: ["Up to 15 menu items", "1 template", "QR code + shareable link", "$ / L.L. display"],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Basic",
    price: "$6",
    period: "/month",
    description: "Everything you need to take real orders.",
    features: [
      "Unlimited menu items",
      "Cart, checkout & WhatsApp orders",
      "Per-item availability control",
      "Kitchen order queue",
      "Order dashboard & basic analytics",
    ],
    cta: "Start free trial",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$14",
    period: "/month",
    description: "For growing, multi-location businesses.",
    features: [
      "Everything in Basic",
      "Driver tracking & assignment",
      "Promo codes & combo deals",
      "Multi-branch support",
      "Priority support",
    ],
    cta: "Start free trial",
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Simple pricing, paid your way</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          No credit card required to start. Pay later via OMT, Whish Money, or cash — we&apos;ll confirm and activate your
          account directly.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={cn("relative flex flex-col p-6", tier.highlighted && "border-primary shadow-soft")}
          >
            {tier.highlighted && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="default">
                Most popular
              </Badge>
            )}
            <h3 className="font-bold">{tier.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold">{tier.price}</span>
              <span className="text-sm text-muted-foreground">{tier.period}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" variant={tier.highlighted ? "default" : "outline"} asChild>
              <Link href="/onboarding">{tier.cta}</Link>
            </Button>
          </Card>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-lg text-center text-xs text-muted-foreground">
        Need multiple branches, a custom domain, or a dedicated setup? <Link href="/onboarding" className="underline">Talk to us</Link> about a custom plan.
      </p>
    </section>
  );
}
