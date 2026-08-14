import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { VendoSurface } from "@/vendo/vendo-root";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://eigenwork.com"),
  title: {
    template: "%s | EigenWork",
    default: "EigenWork — Technical hiring, right from Slack",
  },
  description: "EigenWork screens engineers on their real code and work history. Post a role in Slack, get a ranked shortlist with risk flags, and reach out — built for technical hiring.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark'||(!('theme' in localStorage)&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <VendoSurface>{children}</VendoSurface>
      </body>
    </html>
  );
}
