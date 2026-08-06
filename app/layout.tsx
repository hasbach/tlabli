import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Playfair_Display_SC, Fraunces, Cairo } from "next/font/google";
import "./globals.css";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const fontDisplay = Playfair_Display_SC({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display",
  display: "swap",
});

const fontBakery = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-bakery",
  display: "swap",
});

const fontArabic = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tlabli — Digital menus & ordering for Lebanese restaurants",
  description:
    "Tlabli lets restaurant, snack shop, bakery and cafe owners in Lebanon build a beautiful digital menu with WhatsApp ordering in minutes — no design skills, no dev team, no big budget.",
  metadataBase: new URL("https://tlabli.com"),
  openGraph: {
    title: "Tlabli — Digital menus & ordering for Lebanese restaurants",
    description:
      "Build a beautiful digital menu with WhatsApp ordering in minutes.",
    siteName: "Tlabli",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body
        className={`${fontSans.variable} ${fontDisplay.variable} ${fontBakery.variable} ${fontArabic.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
