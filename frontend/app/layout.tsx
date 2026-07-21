import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";

import "./globals.css";

import { QueryProvider } from "@/lib/query-provider";
import { AuthGate } from "@/lib/auth-gate";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";

const sans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-app-sans",
  display: "swap",
});

const display = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-app-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "旅迹 · AI 旅行攻略",
  description: "像马蜂窝一样逛目的地，用 AI 一键生成可落地的旅行攻略",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`h-full antialiased ${sans.variable} ${display.variable}`}>
      <body className="min-h-full flex flex-col font-sans text-[var(--foreground)]">
        <QueryProvider>
          <AuthGate>
            <Navbar />
            <main className="flex-1 flex flex-col">{children}</main>
            <SiteFooter />
          </AuthGate>
        </QueryProvider>
      </body>
    </html>
  );
}
