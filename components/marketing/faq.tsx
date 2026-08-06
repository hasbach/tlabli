const faqs = [
  {
    q: "Do I need a credit card to sign up?",
    a: "No. Create your menu for free. When you're ready to take real orders, you pay via OMT, Whish Money, or cash — we activate your account manually, no international card needed.",
  },
  {
    q: "How do orders actually reach me?",
    a: "A structured order summary opens in WhatsApp on the customer's phone, ready to send to your business number — the same way you probably take orders today, just with less back-and-forth.",
  },
  {
    q: "Can I show prices in both dollars and Lebanese pounds?",
    a: "Yes — set your own exchange rate and every price shows in both currencies automatically, so you're never stuck with an outdated printed menu.",
  },
  {
    q: "What if my menu changes often?",
    a: "Update items, prices, or mark something sold out in seconds — no reprinting, no waiting on a designer.",
  },
  {
    q: "Is Arabic actually supported, or just translated?",
    a: "Full right-to-left layout, not a translated English template. Your customers can browse and order comfortably in Arabic.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
      <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Questions owners actually ask</h2>
      <div className="mt-10 divide-y divide-border">
        {faqs.map((item) => (
          <div key={item.q} className="py-5">
            <h3 className="font-semibold">{item.q}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
