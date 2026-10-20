import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Map Agent",
  description: "Walk your city before you live in it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
