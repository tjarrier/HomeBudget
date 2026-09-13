import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import { PostHog } from '@/components/posthog'

// Auto-hebergees par next/font : aucune requete vers Google au runtime, et
// aucun decalage de rendu au chargement.
//
// DEUX familles (spec 2026-09-13, « La typographie ») : Manrope porte le
// texte courant, Bricolage Grotesque le solde et les titres.
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
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
    <html lang="fr" className={`${manrope.variable} ${bricolage.variable}`}>
      {/* Les couleurs viennent des tokens. Toute classe `slate-*` ecrite ici
          court-circuiterait le theme : changer un token ne se verrait plus. */}
      <body className="min-h-screen bg-app text-strong antialiased">
        <PostHog />
        {children}
      </body>
    </html>
  )
}
