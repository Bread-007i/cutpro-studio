import type { Metadata, Viewport } from "next";
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
  title: "ตัดต่อโปร Studio — แอปตัดต่อวิดีโอมืออาชีพ",
  description:
    "แอปตัดต่อวิดีโอที่ติดตั้งลงเดสก์ท็อปได้ ครบทั้งไทม์ไลน์หลายแทร็ก เกรดสีระดับมืออาชีพ (วีลสี Lift/Gamma/Gain เส้นโค้ง RGB ฮิสโตแกรม ลุคส์สำเร็จรูป) ผู้ช่วย AI แบ่งฉาก ตัดเสียงเงียบ สร้างซับอัตโนมัติ และส่งออกวิดีโอ ทำงานในเครื่อง ไม่ต้องอัปโหลดไฟล์",
  keywords: [
    "ตัดต่อวิดีโอ",
    "video editor",
    "capcut",
    "davinci resolve",
    "color grading",
    "timeline editor",
    "AI video",
    "แอปตัดต่อ",
  ],
  applicationName: "ตัดต่อโปร Studio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ตัดต่อโปร",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0b10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0e] text-zinc-100`}
        style={{
          fontFamily:
            'var(--font-geist-sans), "Noto Sans Thai", "Noto Sans Thai UI", "Leelawadee UI", Sukhumvit Set, Tahoma, system-ui, sans-serif',
        }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
