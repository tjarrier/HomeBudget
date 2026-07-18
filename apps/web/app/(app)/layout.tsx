import { exigerSession } from '@/lib/session'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const session = await exigerSession()
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/">Tableau de bord</Link>
          <Link href="/depenses">Dépenses</Link>
          <Link href="/config">Configuration</Link>
        </nav>
        <span className="text-sm text-slate-500">{session.nom}</span>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
