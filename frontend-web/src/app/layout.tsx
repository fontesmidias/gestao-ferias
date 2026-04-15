import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner'
import { Sidebar } from '@/components/Sidebar'
import { AuthProvider } from '@/components/AuthContext'
import { TourProvider } from '@/components/TourProvider'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'
import { TenantBrandWrapper } from '@/components/TenantBrandWrapper'

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GestaoFerias | SaaS de Gestao Estrategica",
  description: "A plataforma definitiva para gestao de ferias com conformidade CLT e ROI em tempo real.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
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
          <ImpersonationBanner />
          <ServiceWorkerRegistration />
          <TenantBrandWrapper />
          <Sidebar />
          <div className="flex-1 h-full overflow-y-auto">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
