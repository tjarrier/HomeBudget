import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import { PostHogProvider } from '@/components/posthog-provider'

// Auto-hebergee par next/font : aucune requete vers Google au runtime, et
// aucun decalage de rendu au chargement.
//
// UNE SEULE famille. Le design system ne porte pas de serif : la hierarchie
// vient du poids, de la taille et du contraste de surface, jamais d'un
// changement de fonte.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = { title: 'HomeBudget' }

// `viewport-fit=cover` etend le document sous l'indicateur d'accueil des
// iPhone. Sans lui, env(safe-area-inset-bottom) vaut 0 et la barre de
// navigation basse passerait dessous. Exporter cet objet REMPLACE les valeurs
// par defaut de Next : width et initialScale sont redeclares ici, sans quoi la
// page se rendrait a la largeur de bureau sur telephone.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      {/* Les couleurs viennent des tokens. Toute classe `slate-*` ecrite ici
          court-circuiterait le theme : changer un token ne se verrait plus. */}
      <body className="min-h-screen bg-app text-strong antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
