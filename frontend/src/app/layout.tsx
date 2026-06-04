import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Food For You",
  description: "Food deals and recommendations near VinUniversity",
  icons: {
    icon: "/xanhsm-logo.png",
    shortcut: "/xanhsm-logo.png",
    apple: "/xanhsm-logo.png"
  },
  openGraph: {
    title: "Food For You",
    description: "Food deals and recommendations near VinUniversity",
    images: [
      {
        url: "/xanhsm-logo.png",
        alt: "Xanh SM logo"
      }
    ]
  }
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
