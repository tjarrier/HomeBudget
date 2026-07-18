import { formaterDate, formaterMontant } from '@/lib/format'
import { listerVersions } from '@homebudget/db'
import { ratioThomas, totalChargesCommunes } from '@homebudget/domain'
import { FormulaireVersion } from './formulaire-version'

export const dynamic = 'force-dynamic'

export default async function Config() {
  const versions = await listerVersions()
  const courante = versions.find((v) => v.dateFin === null)

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" data-testid="timeline-versions">
        <h2 className="text-lg font-semibold">Historique de la configuration</h2>
        <ol className="flex flex-col gap-3">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{v.libelle}</span>
                <span className="text-xs text-slate-500">
                  {formaterDate(v.dateDebut)} → {v.dateFin ? formaterDate(v.dateFin) : 'en cours'}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                <div>Salaire Thomas : {formaterMontant(v.salaireNetThomas)}</div>
                <div>Salaire Liz : {formaterMontant(v.salaireNetLiz)}</div>
                <div>Charges communes : {formaterMontant(totalChargesCommunes(v))}</div>
                <div>Part Thomas : {Math.round(ratioThomas(v) * 100)} %</div>
              </dl>
              {v.dateFin !== null && (
                <p className="mt-2 text-xs text-slate-400">
                  Version close : elle n'est plus modifiable. Créez-en une nouvelle pour changer les
                  règles.
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <FormulaireVersion courante={courante ?? null} />
    </div>
  )
}
