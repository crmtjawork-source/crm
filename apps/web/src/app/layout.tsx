import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "CRM",
  description: "מערכת CRM פנימית",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
