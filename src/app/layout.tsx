import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"),
  title: {
    default: "Shiv Radium — Personalised Gifts, Name Plates & Photo Frames",
    template: "%s | Shiv Radium",
  },
  description:
    "Personalised gifts made to order in India — name plates, photo frames, photo mugs, handmade crafts and custom gift hampers. Free artwork proof before we make it.",
  openGraph: {
    type: "website",
    siteName: "Shiv Radium",
    title: "Shiv Radium — Personalised Gifts Made Just For You",
    description:
      "Name plates, photo frames, photo mugs and custom gifts, made to order in India.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
