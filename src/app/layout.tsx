import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "PCSlotCheck",
  description:
    "Open-source PC component slot compatibility checker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-zinc-50"
            >
              PCSlotCheck
            </Link>
            <ul className="flex gap-6 text-sm">
              <li>
                <Link
                  href="/"
                  className="text-zinc-400 transition-colors hover:text-zinc-50"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/search"
                  className="text-zinc-400 transition-colors hover:text-zinc-50"
                >
                  Browse
                </Link>
              </li>
              <li>
                <Link
                  href="/support"
                  className="text-zinc-400 transition-colors hover:text-zinc-50"
                >
                  Support
                </Link>
              </li>
            </ul>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
