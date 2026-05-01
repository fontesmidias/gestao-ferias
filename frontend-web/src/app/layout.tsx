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
import { SessionTopbar } from '@/components/SessionTopbar'
import { themeInitScript } from '@/components/DarkModeToggle'
import { I18nProvider } from '@/lib/i18n'

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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica tema antes do React montar — evita flash (FR-V31-BRAND-004) */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} antialiased h-screen flex bg-slate-950 text-slate-200 overflow-hidden`}>
        <AuthProvider>
          <I18nProvider>
            <Toaster richColors theme="dark" position="top-right" />
            <SessionTopbar />
            <TourProvider />
            <ImpersonationBanner />
            <ServiceWorkerRegistration />
            <TenantBrandWrapper />
            <Sidebar />
            <div className="flex-1 h-full overflow-y-auto">
              {children}
            </div>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
