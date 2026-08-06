import Link from "next/link";
import { ArrowUpRight, Beef, Croissant, Wine, Coffee } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

const templates = [
  {
    slug: "burger-house",
    theme: "theme-fast-food",
    name: "Fast Food & Snacks",
    description: "Bold, high-energy layout built for quick decisions — grid of dishes, sticky cart, big tappable add buttons.",
    icon: Beef,
  },
  {
    slug: "sweet-crumbs",
    theme: "theme-bakery",
    name: "Bakery & Small Business",
    description: "Warm and cozy, single-scroll layout with soft rounded cards — feels handmade, not corporate.",
    icon: Croissant,
  },
  {
    slug: "le-jardin",
    theme: "theme-fine-dining",
    name: "Fine Dining",
    description: "Minimal, elegant, text-forward menu with classic dotted price leaders — no clutter, no loud colors.",
    icon: Wine,
  },
  {
    slug: "cafe-terra",
    theme: "theme-cafe",
    name: "Café",
    description: "Earthy terracotta tones, relaxed pacing — built for browsing over coffee, not rushing an order.",
    icon: Coffee,
  },
];

export default function TemplatesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <Badge variant="secondary" className="mb-4">
          4 templates, ready today
        </Badge>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Pick a template that fits your business</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Every template is a full live menu — categories, cart, checkout, WhatsApp ordering. Tap one to see it exactly as
          your customers would.
        </p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 sm:grid-cols-2">
        {templates.map((tpl) => (
          <Link key={tpl.slug} href={`/${tpl.slug}`} className={tpl.theme}>
            <Card className="group h-full cursor-pointer overflow-hidden border-2 transition-all hover:-translate-y-1 hover:shadow-soft">
              <div
                className="flex h-32 items-center justify-center"
                style={{ background: "linear-gradient(135deg, var(--primary), var(--secondary))" }}
              >
                <tpl.icon className="h-12 w-12 text-white/90" strokeWidth={1.5} />
              </div>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{tpl.name}</h3>
                  <ArrowUpRight className="h-5 w-5 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{tpl.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
      <Footer />
    </div>
  );
}
