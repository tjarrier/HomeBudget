'use client'

import { preparerReglementAction } from '@/actions/depenses'
import { FormulaireDepense } from '@/components/formulaire-depense'
import { lienFermerSaisie, modeSaisie } from '@/lib/url-saisie'
import type { Cents, Personne } from '@homebudget/domain'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Reglement = { montant: Cents; payePar: Personne }

/**
 * La feuille de saisie, ouverte par-dessus n'importe quel ecran (spec
 * 2026-09-13).
 *
 * Un <dialog> NATIF ouvert par showModal(), pour la raison qui l'a fait choisir
 * pour `MenuCompte` : piege de focus, Escape, arriere-plan inerte et ::backdrop,
 * sans une ligne de JS. Ancre en bas sous 768px, centre au-dela.
 *
 * L'etat ouvert vit dans l'URL (`lib/url-saisie.ts`) : le bouton retour du
 * telephone la ferme, et fermer la feuille — Escape, « Fermer », un clic sur le
 * voile, une ecriture reussie — retire `saisie` de l'URL. Montee UNE fois, dans
 * le layout du groupe (app).
 *
 * Le formulaire n'est MONTE que feuille ouverte : chaque ouverture repart d'un
 * formulaire vierge, et le fermer apres une ecriture le demonte — c'est ce qui
 * desarme un second clic.
 */
export function FeuilleSaisie({ personne }: { personne: Personne }) {
  const feuille = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const chemin = usePathname()
  const params = useSearchParams()
  const mode = modeSaisie(params.get('saisie'))

  // `undefined` : pas encore lu. `null` : rien a regler.
  const [reglement, setReglement] = useState<Reglement | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)

  const fermer = useCallback(() => {
    router.replace(lienFermerSaisie(chemin, new URLSearchParams(params)), { scroll: false })
  }, [router, chemin, params])

  useEffect(() => {
    const dialogue = feuille.current
    if (!dialogue) return
    if (mode && !dialogue.open) dialogue.showModal()
    if (!mode && dialogue.open) dialogue.close()
  }, [mode])

  // Le montant du reglement vient du SERVEUR, par le meme `synthese()` que
  // l'accueil : jamais d'un parametre d'URL qu'on pourrait taper a la main.
  useEffect(() => {
    setReglement(undefined)
    setErreur(null)
    if (mode !== 'regler') return
    let annule = false
    preparerReglementAction().then((r) => {
      if (annule) return
      if (r.ok) setReglement(r.valeur)
      else setErreur(r.message)
    })
    return () => {
      annule = true
    }
  }, [mode])

  const rienARegler = mode === 'regler' && reglement === null
  // Le formulaire lit `reglement` dans son etat initial, une seule fois : il ne
  // se monte qu'une fois cette valeur connue.
  const pret = mode === 'libre' || (mode === 'regler' && reglement !== undefined && !rienARegler)

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: le clic sur le voile double Escape, que le <dialog> natif gere deja au clavier.
    <dialog
      ref={feuille}
      aria-label="Nouvelle dépense"
      // Le <dialog> se ferme seul sur Escape : on le repercute dans l'URL. Quand
      // c'est l'URL qui a change (bouton retour), `mode` vaut deja null.
      onClose={() => {
        if (mode) fermer()
      }}
      onClick={(evenement) => {
        if (evenement.target === feuille.current) feuille.current?.close()
      }}
      className={[
        'w-full border-0 bg-surface p-0 text-strong backdrop:bg-overlay',
        'max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain',
        'max-md:mt-auto max-md:mb-0 max-md:max-w-none max-md:rounded-t-3xl',
        'md:m-auto md:max-w-md md:rounded-3xl',
      ].join(' ')}
    >
      <div className="sticky top-0 z-10 bg-surface px-5 pt-2">
        <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-subtle md:hidden" />
        <div className="flex min-h-12 items-center justify-between">
          <h2 className="font-display text-[1.3125rem] font-semibold tracking-[-0.015em]">
            Nouvelle dépense
          </h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => feuille.current?.close()}
            className="-mr-2 flex size-11 items-center justify-center rounded-full bg-muted text-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>

      {erreur && <p className="px-5 pb-5 text-sm text-destructive">{erreur}</p>}
      {rienARegler && (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          Vous êtes à jour : il n’y a rien à régler.
        </p>
      )}
      {pret && (
        <FormulaireDepense
          key={mode}
          personne={personne}
          reglement={reglement ?? undefined}
          onEnregistree={fermer}
        />
      )}
    </dialog>
  )
}
