import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockNote",
  description: "AI-powered personal portfolio daily report",
  icons: {
    // SVGアイコン（モダンブラウザ）→ フォールバックにPNG
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/logo.png", type: "image/png" },
    ],
    // iOSホーム画面アイコン: /public/apple-touch-icon.png を用意すると有効になる
    // （ロゴ左側のイラスト部分を正方形にトリミングしたPNGを 180×180px で配置）
    apple: "/apple-touch-icon.png",
    shortcut: "/icon.svg",
  },
};

// safe-area-inset-bottom（iPhoneの丸角）を有効にする
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
