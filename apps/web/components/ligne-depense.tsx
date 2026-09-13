import type { ReactNode } from 'react'

import { BoutonSupprimerDepense } from '@/components/bouton-supprimer-depense'
import { Montant } from '@/components/montant'
import { formaterDate } from '@/lib/format'
import type { Depense, TypeDepense } from '@homebudget/domain'
import { nomPersonne } from '@homebudget/domain'

/** Le type, en toutes lettres : c'est le nom accessible de l'icone. */
const LIBELLES_TYPE: Record<TypeDepense, string> = {
  charge_fixe: 'Charge fixe',
  transfert: 'Transfert',
  courante: 'Courante',
}

const ICONES: Record<TypeDepense, ReactNode> = {
  charge_fixe: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  transfert: (
    <>
      <path d="M4 8h15" />
      <path d="m15 4 4 4-4 4" />
      <path d="M20 16H5" />
      <path d="m9 12-4 4 4 4" />
    </>
  ),
  courante: (
    <>
      <path d="M6 7h12l1 14H5z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </>
  ),
}

/**
 * Une entree de l'historique : quoi, quand, qui a paye, combien.
 *
 * L'icone code le TYPE, jamais la personne. Elle porte son libelle en
 * `aria-label` : l'information ne passe pas par le dessin seul.
 *
 * « payé par » et la date `05/07/2026` sont gardes, meme la ou la maquette
 * ecrit « Liz → Thomas » et « 5 juil. » : le parcours des filtres (#28)
 * reconnait une ligne de Liz a ce texte et un mois a `/07/2026`.
 *
 * `parts` est AFFICHE, pas seulement stocke : c'est la seule chose que cet ecran
 * prouve a l'oeil — les parts d'une depense ne bougent plus jamais apres sa
 * saisie. Le parcours Playwright compare ce texte avant et apres la creation
 * d'une version de config ; le retirer rendrait ce test vide de sens.
 *
 * `supprimable` est OPT-IN (issue #40) : seul l'historique de `/depenses`
 * l'active. Un appelant futur n'herite pas d'un bouton de suppression sans
 * l'avoir demande.
 */
export function LigneDepense({
  depense,
  avecPayeur = true,
  supprimable = false,
}: { depense: Depense; avecPayeur?: boolean; supprimable?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 border-t border-subtle py-3 first:border-t-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-marque-surface text-marque">
        <svg
          role="img"
          aria-label={LIBELLES_TYPE[depense.type]}
          viewBox="0 0 24 24"
          className="size-[19px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONES[depense.type]}
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.9375rem] font-semibold">{depense.description}</div>
        <div className="mt-px flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground">
          <span className="tabular-nums">{formaterDate(depense.date)}</span>
          {avecPayeur ? (
            <>
              <span aria-hidden="true">·</span>
              <span>payé par {nomPersonne(depense.payePar)}</span>
            </>
          ) : null}
          {/* La PROVENANCE : ce mot dit qui a ecrit la ligne (issue #24). */}
          {depense.genereAuto ? (
            <>
              <span aria-hidden="true">·</span>
              <span>générée</span>
            </>
          ) : null}
        </div>
        {/* Parts LUES, jamais recalculees a l'affichage. */}
        <div className="mt-px text-xs text-muted-foreground">
          Thomas <Montant cents={depense.parts.thomas} niveau="discret" /> · Liz{' '}
          <Montant cents={depense.parts.liz} niveau="discret" />
        </div>
      </div>

      <Montant cents={depense.montant} niveau="courant" className="whitespace-nowrap" />

      {supprimable ? (
        <BoutonSupprimerDepense
          id={depense.id}
          description={depense.description}
          montant={depense.montant}
        />
      ) : null}
    </li>
  )
}
