import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: 'HomeBudget' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
