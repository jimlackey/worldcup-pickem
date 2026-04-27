import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font — no runtime call to fonts.googleapis.com.
// We expose each as a CSS variable so Tailwind's font-display / font-body /
// font-mono utilities can reference them (see tailwind.config.ts).
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  // DM Sans is a variable font; loading the full weight range matches what
  // the previous @import was requesting (100..1000 with italic).
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "World Cup Pick'em",
    template: "%s | World Cup Pick'em",
  },
  description:
    "Predict every match of the 2026 FIFA World Cup. Create pick sets, compete in pools, and climb the leaderboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh font-body">{children}</body>
    </html>
  );
}
