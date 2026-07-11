import type { Metadata } from "next";
import "./globals.css";

import { QueryProvider } from "@/lib/query-provider";
import { AuthGate } from "@/lib/auth-gate";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "旅行攻略生成器",
  description: "AI 自动生成旅行攻略 - 按天行程、地图路线、预算估算",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-[#333]">
        <QueryProvider>
          <AuthGate>
            <Navbar />
            <main className="flex-1 flex flex-col">{children}</main>
          </AuthGate>
        </QueryProvider>
      </body>
    </html>
  );
}
