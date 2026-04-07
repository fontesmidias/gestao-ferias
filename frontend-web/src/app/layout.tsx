import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner'
import { Sidebar } from '@/components/Sidebar'
import { AuthProvider } from '@/components/AuthContext'
import { TourProvider } from '@/components/TourProvider'

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GestãoFérias | SaaS de Gestão Estratégica",
  description: "A plataforma definitiva para gestão de férias com conformidade CLT e ROI em tempo real.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased h-screen flex bg-slate-950 text-slate-200 overflow-hidden`}>
        <AuthProvider>
          <Toaster richColors theme="dark" position="top-right" />
          <TourProvider />
          <Sidebar />
          <div className="flex-1 h-full overflow-y-auto">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
