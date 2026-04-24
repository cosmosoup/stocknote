import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockNote",
  description: "AI-powered personal portfolio daily report",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-slate-100 text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
