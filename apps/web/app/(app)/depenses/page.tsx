import { Ligne } from '@/components/ligne'
import { Montant } from '@/components/montant'
import { Section } from '@/components/section'
import { formaterDate } from '@/lib/format'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { nomPersonne } from '@homebudget/domain'
import { FormulaireDepense } from './formulaire-depense'

export const dynamic = 'force-dynamic'

export default async function Depenses() {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const depenses = await listerDepenses()

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      {/* `sr-only` par coherence avec les deux autres ecrans (issue #6) :
          « Ajouter une depense » (h2 ci-dessous) porte deja le titre visuel. */}
      <h1 className="sr-only">Dépenses</h1>
      <FormulaireDepense personne={session.personne} />

      <Section titre="Dépenses">
        <div data-testid="liste-depenses">
          {depenses.length === 0 ? (
            <p className="text-[0.9375rem] text-muted-foreground">Aucune dépense pour le moment.</p>
          ) : (
            <ul>
              {depenses.map((d) => (
                <Ligne
                  key={d.id}
                  intitule={d.description}
                  meta={`${formaterDate(d.date)} · payé par ${nomPersonne(d.payePar)}`}
                  /* Parts LUES, jamais recalculees a l'affichage. */
                  detail={
                    <>
                      T <Montant cents={d.parts.thomas} niveau="discret" /> / L{' '}
                      <Montant cents={d.parts.liz} niveau="discret" />
                    </>
                  }
                  montant={<Montant cents={d.montant} niveau="notable" />}
                />
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  )
}
