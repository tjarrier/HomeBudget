'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const LIENS: { href: string; libelle: string; icone: ReactNode }[] = [
  {
    href: '/',
    libelle: 'Tableau de bord',
    icone: (
      <>
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </>
    ),
  },
  {
    href: '/depenses',
    libelle: 'Dépenses',
    icone: (
      <>
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </>
    ),
  },
  {
    href: '/config',
    libelle: 'Configuration',
    icone: (
      <>
        <line x1="21" x2="14" y1="4" y2="4" />
        <line x1="10" x2="3" y1="4" y2="4" />
        <line x1="21" x2="12" y1="12" y2="12" />
        <line x1="8" x2="3" y1="12" y2="12" />
        <line x1="21" x2="16" y1="20" y2="20" />
        <line x1="12" x2="3" y1="20" y2="20" />
        <line x1="14" x2="14" y1="2" y2="6" />
        <line x1="8" x2="8" y1="10" y2="14" />
        <line x1="16" x2="16" y1="18" y2="22" />
      </>
    ),
  },
]

/**
 * La navigation principale.
 *
 * Cliente pour une seule raison : `usePathname()`, qui designe le lien actif.
 * L'etat actif est porte par le fond ET par `aria-current`, jamais par la
 * couleur seule — sous 880px les libelles disparaissent et il ne reste que les
 * icones, ou un contraste de fond ne suffirait pas a l'annoncer.
 */
export function NavLaterale() {
  const chemin = usePathname()

  return (
    <nav
      aria-label="Navigation principale"
      className="mt-1 flex gap-0.5 max-md:overflow-x-auto md:flex-col"
    >
      {LIENS.map(({ href, libelle, icone }) => {
        const actif = chemin === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
              actif ? 'bg-muted text-strong' : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-[18px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {icone}
            </svg>
            <span className="max-md:sr-only">{libelle}</span>
          </Link>
        )
      })}
    </nav>
  )
}
