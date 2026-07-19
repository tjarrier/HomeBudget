import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { LigneDepense } from '@/components/ligne-depense'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { FormulaireDepense } from './formulaire-depense'

export const dynamic = 'force-dynamic'

export default async function Depenses() {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const depenses = await listerDepenses()

  return (
    <>
      <EntetePage titre="Dépenses" sousTitre="Chaque part est figée à la saisie" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Carte
          titre="Historique"
          aside={`${depenses.length} ${depenses.length > 1 ? 'dépenses' : 'dépense'}`}
        >
          <div data-testid="liste-depenses">
            {depenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune dépense pour le moment.</p>
            ) : (
              <ul>
                {depenses.map((d) => (
                  <LigneDepense key={d.id} depense={d} />
                ))}
              </ul>
            )}
          </div>
        </Carte>

        {/* `sticky` : la saisie reste a portee quand l'historique s'allonge.
            Neutralise sous lg, ou les deux colonnes s'empilent. */}
        <div className="lg:sticky lg:top-5">
          <FormulaireDepense personne={session.personne} />
        </div>
      </div>
    </>
  )
}
