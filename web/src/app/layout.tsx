import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { themeInitializationScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shop POS",
  description: "Shop POS local retail demo.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-PK" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script id="pos-theme-init" dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
