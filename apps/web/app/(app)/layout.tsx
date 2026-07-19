import { exigerSession } from '@/lib/session'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const session = await exigerSession()
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5">
      <header className="flex items-center justify-between gap-4 border-b border-border py-4">
        <nav className="flex gap-5 text-[0.9375rem] font-medium">
          <Link href="/" className="hover:text-primary">
            Tableau de bord
          </Link>
          <Link href="/depenses" className="hover:text-primary">
            Dépenses
          </Link>
          <Link href="/config" className="hover:text-primary">
            Configuration
          </Link>
        </nav>
        <span className="text-[0.8125rem] text-muted-foreground">{session.nom}</span>
      </header>
      <main className="flex-1 py-6">{children}</main>
    </div>
  )
}
