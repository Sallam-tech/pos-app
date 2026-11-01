import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shop POS | Foundation",
  description: "Local retail POS application foundation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-PK" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
