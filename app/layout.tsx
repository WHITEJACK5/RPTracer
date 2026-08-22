import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRACER v1.0 — AI Risk Manager",
  description:
    "High-frequency AI risk engine for Razorpay — sub-50ms scoring, mule-ring graph intelligence, bounded autonomous defense.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--font-grotesk:'Space Grotesk';--font-inter:'Inter';--font-mono:'JetBrains Mono';}`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
