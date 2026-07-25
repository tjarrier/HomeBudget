'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// `libelleCourt` n'est pas une abreviation de confort : c'est ce qui rend la
// barre basse lisible. Une barre de trois icones muettes est une devinette, et
// « Tableau de bord » ne tient pas dans une cellule de 90px (la largeur plancher
// du projet, 360px, divisee par les quatre cellules).
const LIENS: { href: string; libelle: string; libelleCourt: string; icone: ReactNode }[] = [
  {
    href: '/',
    libelle: 'Tableau de bord',
    libelleCourt: 'Accueil',
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
    libelleCourt: 'Dépenses',
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
    libelleCourt: 'Config',
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
 * La navigation principale : barre basse sous 768px, rail lateral au-dessus.
 *
 * Cliente pour une seule raison : `usePathname()`, qui designe le lien actif.
 * L'etat actif est porte par le fond ET par `aria-current`, jamais par le
 * contraste seul.
 *
 * Les deux libelles sont masques par `hidden` / `md:hidden` et non par
 * `sr-only` : `sr-only` les laisserait TOUS LES DEUX dans l'arbre
 * d'accessibilite, et le nom du lien deviendrait « Tableau de bord Accueil ».
 * Ici, un seul est rendu a la fois, et il correspond toujours au texte visible.
 */
export function NavPrincipale() {
  const chemin = usePathname()

  return (
    <nav
      aria-label="Navigation principale"
      className="flex max-md:flex-1 max-md:items-stretch md:mt-1 md:flex-col md:gap-0.5"
    >
      {LIENS.map(({ href, libelle, libelleCourt, icone }) => {
        const actif = chemin === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'flex items-center rounded-lg transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
              // Barre basse : une cellule par lien, icone au-dessus du libelle,
              // 44px de haut au minimum — le plancher tactile du projet.
              'max-md:min-h-11 max-md:flex-1 max-md:flex-col max-md:justify-center max-md:gap-0.5 max-md:py-1.5',
              // Rail : une rangee icone + libelle.
              'md:gap-3 md:px-2.5 md:py-2 md:text-sm md:font-medium md:whitespace-nowrap',
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
            <span className="hidden md:inline">{libelle}</span>
            <span className="text-[0.625rem] font-medium md:hidden">{libelleCourt}</span>
          </Link>
        )
      })}
    </nav>
  )
}
