import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      {/* Les couleurs viennent des tokens. Toute classe `slate-*` ecrite ici
          court-circuiterait le theme : changer un token ne se verrait plus. */}
      <body className="min-h-screen bg-app text-strong antialiased">{children}</body>
    </html>
  )
}
