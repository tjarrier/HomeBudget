import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { LigneDepense } from '@/components/ligne-depense'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { resumer, synthese } from '@homebudget/domain'
import { FormulaireDepense } from './formulaire-depense'
import { FormulaireGeneration } from './formulaire-generation'

export const dynamic = 'force-dynamic'

export default async function Depenses({
  searchParams,
}: {
  searchParams: Promise<{ regler?: string | string[] }>
}) {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const depenses = await listerDepenses()

  // `?regler=1` (issue #26) ne porte qu'un DRAPEAU, jamais le montant. La
  // synthese est rejouee ICI, sur les depenses deja chargees : zero requete de
  // plus, et le chiffre ne quitte jamais le serveur. Un montant passe par l'URL
  // serait fige au rendu du tableau de bord — donc perime des la depense
  // suivante — et serait une saisie utilisateur a valider.
  const { regler } = await searchParams
  const s = synthese(resumer(depenses))
  // Solde nul : rien a regler. Une URL gardee en favori ne pre-remplit donc
  // jamais rien de faux, elle rend le formulaire ordinaire.
  const reglement =
    regler && s.etat === 'dette' ? { montant: s.montant, payePar: s.debiteur } : undefined

  return (
    <>
      <EntetePage titre="Dépenses" sousTitre="Chaque part est figée à la saisie" />

      {/* `grid-cols-1` borne la colonne a `minmax(0,1fr)`. Sans elle, la colonne
          implicite vaut `auto` et se cale sur le max-content : les montants
          insecables de l'historique poussaient la page a 386px de large sur un
          ecran de 360 (issue C2). */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
        <div className="flex flex-col gap-6 lg:sticky lg:top-5">
          <FormulaireDepense personne={session.personne} reglement={reglement} />
          {/* Sous la saisie, et non au-dessus : on ouvre cet ecran pour saisir
              une depense, pas pour generer un loyer une fois par mois. */}
          <FormulaireGeneration personne={session.personne} />
        </div>
      </div>
    </>
  )
}
