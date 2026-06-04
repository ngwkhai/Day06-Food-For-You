import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Food For You",
  description: "Food deals and recommendations near VinUniversity"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#b9f4f4"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
