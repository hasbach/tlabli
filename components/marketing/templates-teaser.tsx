import Link from "next/link";
import { ArrowRight, Beef, Croissant, Wine, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";

const previews = [
  { slug: "burger-house", theme: "theme-fast-food", name: "Fast Food", icon: Beef },
  { slug: "sweet-crumbs", theme: "theme-bakery", name: "Bakery", icon: Croissant },
  { slug: "le-jardin", theme: "theme-fine-dining", name: "Fine Dining", icon: Wine },
  { slug: "cafe-terra", theme: "theme-cafe", name: "Café", icon: Coffee },
];

export function TemplatesTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Four looks, one platform</h2>
          <p className="mt-2 max-w-md text-muted-foreground">Each template is a full live menu you can preview right now.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/templates">
            See all templates <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {previews.map((p) => (
          <Link key={p.slug} href={`/${p.slug}`} className={`${p.theme} group block`}>
            <div
              className="flex h-36 items-center justify-center rounded-t-xl"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--secondary))" }}
            >
              <p.icon className="h-10 w-10 text-white/90" strokeWidth={1.5} />
            </div>
            <div className="rounded-b-xl border border-t-0 border-border bg-card p-4 transition-colors group-hover:border-primary">
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">View live preview →</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
