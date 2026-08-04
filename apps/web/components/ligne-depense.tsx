import { Avatar } from '@/components/avatar'
import { BadgeType } from '@/components/badge'
import { Montant } from '@/components/montant'
import { formaterDate } from '@/lib/format'
import type { Depense } from '@homebudget/domain'
import { nomPersonne } from '@homebudget/domain'

/**
 * Une entree de l'historique : qui a paye, quoi, quand, combien.
 *
 * `parts` est AFFICHE, pas seulement stocke. La maquette ne le montrait pas,
 * mais c'est la seule chose que cet ecran prouve a l'oeil : les parts d'une
 * depense ne bougent plus jamais apres sa saisie. Le parcours Playwright
 * compare precisement ce texte avant et apres la creation d'une version de
 * config — le retirer rendrait ce test vide de sens.
 */
export function LigneDepense({
  depense,
  avecPayeur = true,
}: { depense: Depense; avecPayeur?: boolean }) {
  return (
    <li className="flex items-center gap-3.5 border-t border-subtle py-3 first:border-t-0">
      <Avatar personne={depense.payePar} taille="sm" decoratif={avecPayeur} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{depense.description}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{formaterDate(depense.date)}</span>
          {avecPayeur ? (
            <>
              <span aria-hidden="true">·</span>
              <span>payé par {nomPersonne(depense.payePar)}</span>
            </>
          ) : null}
          <BadgeType type={depense.type} />
          {/* La PROVENANCE, pas une categorie de plus : le badge dit ce qu'est
              la depense, ce mot dit qui l'a ecrite. D'ou un mot en `text-faint`
              plutot qu'une seconde pastille — et surtout pas une couleur, qui
              coderait un sens que le libelle porte deja (DESIGN.md, regle 2). */}
          {depense.genereAuto ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-faint">générée</span>
            </>
          ) : null}
          {/* Parts LUES, jamais recalculees a l'affichage. */}
          <span className="whitespace-nowrap">
            T <Montant cents={depense.parts.thomas} niveau="discret" /> / L{' '}
            <Montant cents={depense.parts.liz} niveau="discret" />
          </span>
        </div>
      </div>

      <Montant cents={depense.montant} niveau="courant" className="whitespace-nowrap" />
    </li>
  )
}
