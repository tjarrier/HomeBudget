import { Instrument_Serif, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// Auto-hebergees par next/font : aucune requete vers Google au runtime, et
// aucun decalage de rendu au chargement.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata = { title: 'HomeBudget' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${instrumentSerif.variable}`}>
      {/* Les couleurs viennent des tokens. Toute classe `slate-*` ecrite ici
          court-circuiterait le theme : changer un token ne se verrait plus. */}
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
