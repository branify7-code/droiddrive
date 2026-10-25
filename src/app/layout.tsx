import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DroidDrive - Virtual Android Phone with Google Drive Storage",
  description:
    "A virtual Android phone in your browser with Google Drive as phone storage. Upload files, manage photos, play music, and use your cloud quota (5 TB plans supported) as internal storage.",
  keywords: ["virtual phone", "Android simulator", "Google Drive storage", "cloud phone", "web file manager"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "DroidDrive - Virtual Android Phone",
    description: "Google Drive as your phone storage - right in the browser",
    siteName: "DroidDrive",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
