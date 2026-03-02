import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "COINOVA — Crypto Terminal",
  description: "Real-time crypto trading dashboard powered by Binance & Groq AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
