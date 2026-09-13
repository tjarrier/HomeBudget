import Link from 'next/link'

/**
 * Le titre d'ecran. Chaque page en pose un — c'est le <h1> unique du document,
 * sous lequel les `Carte` s'articulent en <h2>.
 *
 * `retour` pose une fleche avant le titre, pour un ecran qu'on n'atteint pas par
 * la navigation principale (le tableau de bord). Son nom accessible est
 * `libelle` : une fleche seule ne dit pas ou elle mene.
 */
export function EntetePage({
  titre,
  sousTitre,
  retour,
}: {
  titre: string
  sousTitre?: string
  retour?: { href: string; libelle: string }
}) {
  return (
    <header className="mb-6 flex items-center gap-1">
      {retour ? (
        <Link
          href={retour.href}
          aria-label={retour.libelle}
          className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[22px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m11 6-6 6 6 6" />
          </svg>
        </Link>
      ) : null}
      <div className="min-w-0">
        <h1 className="font-display text-[1.3125rem] font-semibold tracking-[-0.015em]">{titre}</h1>
        {sousTitre ? <p className="mt-0.5 text-sm text-muted-foreground">{sousTitre}</p> : null}
      </div>
    </header>
  )
}
