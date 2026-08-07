"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Beef, Croissant, Wine, Coffee, ArrowRight, ArrowLeft } from "lucide-react";
import type { RestaurantType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/marketing/navbar";
import { supabase } from "@/lib/supabase/client";

const TYPES: { id: RestaurantType; label: string; description: string; icon: typeof Beef; previewSlug: string }[] = [
  { id: "fast-food", label: "Fast Food & Snacks", description: "Burgers, shawarma, quick bites", icon: Beef, previewSlug: "burger-house" },
  { id: "bakery", label: "Bakery & Small Business", description: "Cakes, pastries, home bakers", icon: Croissant, previewSlug: "sweet-crumbs" },
  { id: "fine-dining", label: "Fine Dining", description: "Full-service restaurants", icon: Wine, previewSlug: "le-jardin" },
  { id: "cafe", label: "Café", description: "Coffee, brunch, light bites", icon: Coffee, previewSlug: "cafe-terra" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<RestaurantType | null>(null);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = TYPES.find((t) => t.id === type);

  async function handleCreateAccount() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);

    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const { error: rpcError } = await supabase.rpc("create_restaurant_with_owner", {
      p_name: name,
      p_slug: slug,
      p_type: selected.id,
      p_whatsapp_number: whatsapp,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1.5 w-12 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h1 className="text-center text-2xl font-extrabold tracking-tight">What kind of business is this for?</h1>
            <p className="mb-8 text-center text-sm text-muted-foreground">We&apos;ll suggest a template that fits — you can change it anytime.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map((t) => (
                <button key={t.id} type="button" onClick={() => setType(t.id)} className="text-left">
                  <Card
                    className={`cursor-pointer p-4 transition-all hover:-translate-y-0.5 ${type === t.id ? "border-primary shadow-soft" : ""}`}
                  >
                    <t.icon className="h-7 w-7 text-primary" strokeWidth={1.5} />
                    <p className="mt-2 font-bold">{t.label}</p>
                    <p className="text-sm text-muted-foreground">{t.description}</p>
                  </Card>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <Button disabled={!type} onClick={() => setStep(2)}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && selected && (
          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-tight">Here&apos;s your starting template</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              This is a live, working preview — cart and WhatsApp checkout included.
            </p>
            <Card className={`mx-auto max-w-sm overflow-hidden theme-${selected.id}`}>
              <div
                className="flex h-32 items-center justify-center"
                style={{ background: "linear-gradient(135deg, var(--primary), var(--secondary))" }}
              >
                <selected.icon className="h-12 w-12 text-white/90" strokeWidth={1.5} />
              </div>
              <div className="p-5">
                <p className="font-bold">{selected.label}</p>
                <Link href={`/${selected.previewSlug}`} target="_blank" className="text-sm text-primary underline">
                  Open live preview →
                </Link>
              </div>
            </Card>
            <div className="mt-8 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Use this template <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="text-center text-2xl font-extrabold tracking-tight">Tell us about your business</h1>
            <p className="mb-8 text-center text-sm text-muted-foreground">You can change all of this later in Settings.</p>
            <div className="mx-auto max-w-sm space-y-4">
              <div>
                <Label htmlFor="ob-name">Business name</Label>
                <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sweet Crumbs Bakery" />
              </div>
              <div>
                <Label htmlFor="ob-whatsapp">WhatsApp number (for order alerts)</Label>
                <Input id="ob-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+961 7X XXX XXX" />
              </div>
            </div>
            <div className="mx-auto mt-8 flex max-w-sm justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button disabled={!name || !whatsapp} onClick={() => setStep(4)}>
                Finish <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && selected && (
          <div>
            <h1 className="text-center text-2xl font-extrabold tracking-tight">Create your account, {name}</h1>
            <p className="mx-auto mb-8 max-w-sm text-center text-sm text-muted-foreground">
              One step left — set a password and your menu goes live.
            </p>
            <div className="mx-auto max-w-sm space-y-4">
              <div>
                <Label htmlFor="ob-email">Email</Label>
                <Input id="ob-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@restaurant.com" />
              </div>
              <div>
                <Label htmlFor="ob-password">Password</Label>
                <Input
                  id="ob-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <div className="mx-auto mt-8 flex max-w-sm justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button disabled={!email || !password || submitting} onClick={handleCreateAccount}>
                {submitting ? "Creating…" : "Create account"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
