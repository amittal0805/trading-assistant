import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Trading Assistant",
  description: "Personal trading assistant for Indian and US markets",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TradeDesk",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 pb-28 md:pb-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
