import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "@/styles/globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import LightBar from "@/components/ui/LightBar";

const inter = localFont({
  src: [
    { path: "./fonts/Inter-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Inter-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/Inter-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Inter-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-Italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/JetBrainsMono-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TRACER v1.0 — AI Risk Manager",
  description:
    "High-frequency AI risk engine for Razorpay — sub-50ms scoring, mule-ring graph intelligence, bounded autonomous defense.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <QueryProvider>
            <LightBar />
            {children}
            <Toaster theme="dark" position="bottom-right" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}