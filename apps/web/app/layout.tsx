import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { env } from "@/lib/env";

// Self-hosted (no request to Google at build or run time).
// Fraunces for titles and emphasis, IBM Plex Sans for text (sober, readable; suits a serious tool).
const sans = localFont({ src: [{ path: "./fonts/ibm-plex-sans-latin-wght-normal.woff2", style: "normal" }, { path: "./fonts/ibm-plex-sans-latin-wght-italic.woff2", style: "italic" }], variable: "--font-sans", weight: "100 700", display: "swap" });
const title = localFont({ src: [{ path: "./fonts/fraunces-latin-full-normal.woff2", style: "normal" }, { path: "./fonts/fraunces-latin-full-italic.woff2", style: "italic" }], variable: "--font-title", weight: "100 900", display: "swap" });
const hand = localFont({ src: "./fonts/caveat-latin-600-normal.woff2", variable: "--font-hand", weight: "600", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-wght-normal.woff2", variable: "--font-mono", weight: "100 800", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "Hivetta", template: "%s · Hivetta" },
  description: "One shared memory for teams that use different AI assistants. Save a decision in Claude, pick it up in ChatGPT.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${title.variable} ${hand.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
