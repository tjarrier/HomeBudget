import { Montant } from '@/components/montant'
import { Section } from '@/components/section'
import { formaterDate } from '@/lib/format'
import { exigerSession } from '@/lib/session'
import { listerVersions } from '@homebudget/db'
import { ratioThomas, totalChargesCommunes } from '@homebudget/domain'
import { FormulaireVersion } from './formulaire-version'

export const dynamic = 'force-dynamic'

export default async function Config() {
  // EN PREMIERE LIGNE : cet ecran affiche les salaires nets et tout l'historique
  // de configuration. Meme raison qu'au tableau de bord — le layout du groupe
  // (app) n'est pas garanti re-rendu a chaque requete de segment, et le
  // middleware ne fait qu'une verification optimiste de la presence du cookie.
  await exigerSession()

  const versions = await listerVersions()
  const courante = versions.find((v) => v.dateFin === null)

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      {/* `sr-only` par coherence avec les deux autres ecrans (issue #6) : le
          titre de `Section` ci-dessous porte deja le titre visuel. */}
      <h1 className="sr-only">Configuration</h1>
      <Section titre="Historique de la configuration">
        <ol data-testid="timeline-versions" className="flex flex-col gap-6">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex flex-col gap-2 border-b border-border pb-6 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{v.libelle}</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {formaterDate(v.dateDebut)} → {v.dateFin ? formaterDate(v.dateFin) : 'en cours'}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Salaire Thomas</dt>
                  <dd>
                    <Montant cents={v.salaireNetThomas} niveau="discret" />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Salaire Liz</dt>
                  <dd>
                    <Montant cents={v.salaireNetLiz} niveau="discret" />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Charges communes</dt>
                  <dd>
                    <Montant cents={totalChargesCommunes(v)} niveau="discret" />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Part Thomas</dt>
                  <dd className="text-[0.9375rem] font-medium tabular-nums text-muted-foreground">
                    {Math.round(ratioThomas(v) * 100)} %
                  </dd>
                </div>
              </dl>
              {v.dateFin !== null && (
                <p className="text-[0.8125rem] text-muted-foreground">
                  Version close : elle n'est plus modifiable. Créez-en une nouvelle pour changer les
                  règles.
                </p>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <FormulaireVersion courante={courante ?? null} />
    </div>
  )
}
