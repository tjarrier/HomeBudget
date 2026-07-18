import type { ReactNode } from 'react'
import './globals.css'
import { cn } from '@/lib/utils'
import { Geist } from 'next/font/google'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata = { title: 'HomeBudget' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={cn('font-sans', geist.variable)}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
