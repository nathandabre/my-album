import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ImageKitProvider } from "@imagekit/next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { AuthHeader } from "@/components/auth-header";

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
  title: "my-album",
  description: "Create and share digital photo albums",
};

const imageKitUrlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? "";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <ClerkProvider>
          <ImageKitProvider urlEndpoint={imageKitUrlEndpoint}>
            <Suspense fallback={<header className="h-16 border-b" />}>
              <AuthHeader />
            </Suspense>
            {children}
          </ImageKitProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
