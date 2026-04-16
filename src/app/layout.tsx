import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Forex Signal Engine",
  description: "Balance-driven forex signal planner with persistent trade tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
