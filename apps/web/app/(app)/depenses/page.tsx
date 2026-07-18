import { formaterDate, formaterMontant } from '@/lib/format'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { FormulaireDepense } from './formulaire-depense'

export const dynamic = 'force-dynamic'

const LIBELLE_PERSONNE = { thomas: 'Thomas', liz: 'Liz' } as const

export default async function Depenses() {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const depenses = await listerDepenses()

  return (
    <div className="flex flex-col gap-8">
      <FormulaireDepense personne={session.personne} />

      <section className="flex flex-col gap-2" data-testid="liste-depenses">
        <h2 className="text-lg font-semibold">Dépenses</h2>
        {depenses.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune dépense pour le moment.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {depenses.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{d.description}</span>
                  <span className="tabular-nums font-semibold">{formaterMontant(d.montant)}</span>
                </div>
                <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {formaterDate(d.date)} · payé par {LIBELLE_PERSONNE[d.payePar]}
                  </span>
                  {/* Parts LUES, jamais recalculees a l'affichage. */}
                  <span className="tabular-nums">
                    T {formaterMontant(d.parts.thomas)} / L {formaterMontant(d.parts.liz)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
