import { LoginGate } from "../components/LoginGate";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thamizhi AI Playground",
  description: "A modular Tamil and English AI research workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><LoginGate>{children}</LoginGate></body>
    </html>
  );
}
