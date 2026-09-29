import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Anton,
  Bangers,
  Poppins,
  Montserrat,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display fonts for captions.
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const bangers = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-bangers" });
const poppins = Poppins({ weight: "800", subsets: ["latin"], variable: "--font-poppins" });
const montserrat = Montserrat({
  weight: "800",
  subsets: ["latin"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Scene2Prompt",
  description: "Cinematic AI video prompts and animated captions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} ${bangers.variable} ${poppins.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
