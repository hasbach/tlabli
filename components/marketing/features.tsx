import {
  MessageCircle,
  Coins,
  Languages,
  Clock,
  ListOrdered,
  BarChart3,
  Truck,
  Ticket,
  WifiOff,
} from "lucide-react";

const features = [
  {
    icon: MessageCircle,
    title: "WhatsApp order alerts",
    description: "Every order lands directly in your WhatsApp — the app you already run your business on.",
  },
  {
    icon: Coins,
    title: "Dual currency pricing",
    description: "Show $ and L.L. together. No more outdated printed menus when the rate moves.",
  },
  {
    icon: Clock,
    title: "Per-item availability",
    description: "Mark a dish sold out in one tap, or schedule it to only show during lunch hours.",
  },
  {
    icon: ListOrdered,
    title: "Kitchen order queue",
    description: "A simple numbered queue for your counter or kitchen — built for rush hour, not corporate reports.",
  },
  {
    icon: BarChart3,
    title: "Real dashboard insights",
    description: "Top-selling items, daily sales, and order volume — no spreadsheets required.",
  },
  {
    icon: Truck,
    title: "Driver assignment",
    description: "Assign a driver and phone number to a delivery so customers know exactly who's bringing their order.",
  },
  {
    icon: Ticket,
    title: "Promo codes & combos",
    description: "Run a discount code or bundle a combo deal without touching your prices.",
  },
  {
    icon: Languages,
    title: "Arabic, English & French",
    description: "Full right-to-left Arabic support — not an afterthought bolted onto an English template.",
  },
  {
    icon: WifiOff,
    title: "Works on weak connections",
    description: "Installable, cached menu pages so your customers can browse even on a shaky connection.",
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Built around how Lebanon actually orders food</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Not a generic template translated into Arabic — every feature here answers something a Lebanese owner
          actually deals with.
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-bold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
