import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "CRM NG",
  description: "Advanced CRM System",
  icons: {
    icon: "/logo-icon.png", // Attempting to use the blue square again, but ensuring cache bust if needed? No, let's try favicon.png if logo-icon failed.
    shortcut: "/logo-icon.png",
    apple: "/logo-icon.png",
  }
};

import { Toaster } from "sonner";

import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen overflow-hidden bg-[#f0f2f5]`}
        suppressHydrationWarning
      >
        <ConfirmProvider>
          <NotificationProvider>
            {children}
            <NotificationDrawer />
            <Toaster
              position="top-right"
              richColors
              closeButton
              theme="light"
              toastOptions={{
                style: {
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 15px -3px rgb(15 23 42 / 0.08)",
                },
              }}
            />
          </NotificationProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
