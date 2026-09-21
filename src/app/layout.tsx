import type { Metadata } from "next";
import { Open_Sans, Oswald } from "next/font/google";
import Navbar from "@/components/navbar";
import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

// Condensed, heavy-weight display face standing in for the proprietary
// Gotham Narrow used for every heading on magic.wizards.com.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "MTG Deckbuilder",
  description: "Build and refine Commander decks from cards you own.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${openSans.variable} ${oswald.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
