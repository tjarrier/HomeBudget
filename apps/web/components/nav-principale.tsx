'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { lienOuvrirSaisie } from '@/lib/url-saisie'
import { cn } from '@/lib/utils'

const ACCUEIL = {
  href: '/',
  libelle: 'Accueil',
  icone: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
}

const DEPENSES = {
  href: '/depenses',
  libelle: 'Dépenses',
  icone: (
    <>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4.5 6h.01" />
      <path d="M4.5 12h.01" />
      <path d="M4.5 18h.01" />
    </>
  ),
}

/**
 * La navigation principale : barre basse de trois cases sous 768px, rail
 * lateral au-dessus. UNE liste pour les deux tailles.
 *
 * Au centre de la barre, le « + » : l'action la plus frequente de l'app, a
 * portee de pouce depuis n'importe quel ecran. C'est un LIEN qui ajoute
 * `saisie=1` a l'URL courante en gardant ses autres parametres — la feuille
 * s'ouvre par-dessus l'ecran, filtres compris. Au rail, il passe en tete.
 *
 * Config n'est plus ici : c'est un geste rare (une revision de loyer), il vit
 * dans le menu du compte.
 *
 * L'etat actif est porte par la couleur, la pastille ET `aria-current`, jamais
 * par le contraste seul.
 */
export function NavPrincipale() {
  const chemin = usePathname()
  const params = useSearchParams()

  return (
    <nav
      aria-label="Navigation principale"
      className="grid flex-1 grid-cols-3 items-center md:mt-1 md:flex md:flex-col md:items-stretch md:gap-0.5"
    >
      <Lien {...ACCUEIL} actif={chemin === ACCUEIL.href} />
      <Link
        href={lienOuvrirSaisie(chemin, new URLSearchParams(params), 'libre')}
        scroll={false}
        aria-label="Ajouter une dépense"
        className={cn(
          'flex items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/85',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
          // Barre basse : un cercle de 58px qui deborde de 26px au-dessus.
          'max-md:-mt-6.5 max-md:size-[3.625rem] max-md:justify-self-center max-md:rounded-full max-md:shadow-action',
          // Rail : un bouton plein, en tete de la liste.
          'md:order-first md:mb-3 md:min-h-11 md:gap-2 md:rounded-lg md:px-3 md:text-sm md:font-bold',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[26px] shrink-0 md:size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span className="hidden md:inline">Ajouter une dépense</span>
      </Link>
      <Lien {...DEPENSES} actif={chemin === DEPENSES.href} />
    </nav>
  )
}

function Lien({
  href,
  libelle,
  icone,
  actif,
}: {
  href: string
  libelle: string
  icone: ReactNode
  actif: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        'flex items-center rounded-lg transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
        'max-md:min-h-12 max-md:flex-col max-md:justify-center max-md:gap-0.5',
        'md:gap-3 md:px-2.5 md:py-2',
        actif ? 'text-emphasis md:bg-marque-surface' : 'text-muted-foreground hover:text-strong',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full max-md:h-7.5 max-md:w-14',
          actif && 'max-md:bg-marque-surface',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[21px] shrink-0 md:size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icone}
        </svg>
      </span>
      <span className="text-[0.6875rem] font-bold md:text-sm md:font-semibold">{libelle}</span>
    </Link>
  )
}
