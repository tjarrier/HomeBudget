import { BadgeVersion } from '@/components/badge'
import { EntetePage } from '@/components/entete-page'
import { Montant } from '@/components/montant'
import { formaterDate } from '@/lib/format'
import { exigerSession } from '@/lib/session'
import { listerVersions } from '@homebudget/db'
import { type Charge, ratioThomas, totalChargesCommunes } from '@homebudget/domain'
import { FormulaireVersion } from './formulaire-version'

export const dynamic = 'force-dynamic'

export default async function Config() {
  // EN PREMIERE LIGNE : cet ecran affiche les salaires nets et tout l'historique
  // de configuration. Meme raison qu'au tableau de bord — le layout du groupe
  // (app) n'est pas garanti re-rendu a chaque requete de segment, et le
  // middleware ne fait qu'une verification optimiste de la presence du cookie.
  await exigerSession()

  const toutes = await listerVersions()
  const courante = toutes.find((v) => v.dateFin === null)
  // La plus RECENTE en tete : c'est la regle en vigueur qu'on vient consulter,
  // l'historique n'est que la profondeur derriere elle. `listerVersions()` rend
  // l'ordre chronologique ; on ne le change pas a la source, d'autres lectures
  // en dependent.
  const versions = [...toutes].reverse()

  return (
    <>
      <EntetePage titre="Configuration" sousTitre="Historique append-only des règles" />

      {/* `grid-cols-1` : meme borne que sur les deux autres ecrans. Cette grille
          ne debordait pas encore — son contenu est plus etroit — mais elle porte
          le meme defaut, et c'est la longueur d'un libelle de version qui decide
          si elle craque. Voir issue C2. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[0.9375rem] font-semibold">Historique de la configuration</h2>
            <span className="text-xs text-faint">
              {versions.length} {versions.length > 1 ? 'versions' : 'version'}
            </span>
          </div>

          <ol data-testid="timeline-versions">
            {versions.map((v, i) => {
              const close = v.dateFin !== null
              return (
                <li key={v.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-4">
                  {/* La colonne de pastilles : purement decorative, l'etat de
                      chaque version est ecrit dans son badge. */}
                  <div aria-hidden="true" className="flex flex-col items-center">
                    <span
                      className={`mt-5 size-3 shrink-0 rounded-full border-2 ${
                        close ? 'border-input bg-surface' : 'border-strong bg-emphasis'
                      }`}
                    />
                    {i < versions.length - 1 ? (
                      <span className="my-1.5 w-0.5 flex-1 bg-subtle" />
                    ) : null}
                  </div>

                  <article className="mb-4 rounded-xl border border-subtle bg-surface p-5 shadow-xs">
                    <div className="flex items-center justify-between gap-2.5">
                      <h3 className="text-sm font-semibold">{v.libelle}</h3>
                      <BadgeVersion close={close} />
                    </div>
                    <p className="mt-1 text-xs text-faint">
                      {formaterDate(v.dateDebut)} →{' '}
                      {v.dateFin ? formaterDate(v.dateFin) : "aujourd'hui"}
                    </p>

                    <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-1.5 text-xs sm:grid-cols-2">
                      <Poste libelle="Salaire Thomas" valeur={v.salaireNetThomas} />
                      <Poste libelle="Salaire Liz" valeur={v.salaireNetLiz} />
                      <Poste libelle="Charges communes" valeur={totalChargesCommunes(v)} />
                      <div className="flex justify-between gap-2.5">
                        <dt className="text-muted-foreground">Part Thomas</dt>
                        <dd className="text-xs font-semibold tabular-nums whitespace-nowrap">
                          {Math.round(ratioThomas(v) * 100)} %
                        </dd>
                      </div>
                    </dl>

                    <Pastilles libelle="Charges communes" charges={v.chargesCommunes} />
                    <Pastilles libelle="Perso Thomas" charges={v.chargesPersoThomas} />
                    <Pastilles libelle="Perso Liz" charges={v.chargesPersoLiz} />

                    {close ? (
                      <p className="mt-2.5 text-xs text-faint">
                        Version close : elle n'est plus modifiable. Créez-en une nouvelle pour
                        changer les règles.
                      </p>
                    ) : null}
                  </article>
                </li>
              )
            })}
          </ol>

          {/* Une base fraiche n'a aucune version : sans ce mot, l'ecran n'offre
              qu'un titre suivi de rien, et l'utilisateur ne sait pas si l'app
              charge, echoue, ou attend qu'il commence. La liste des depenses
              porte le meme filet de securite. */}
          {versions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-subtle px-5 py-8 text-center text-sm text-faint">
              Aucune version pour le moment. Créez la première pour fixer les règles de répartition.
            </p>
          ) : null}
        </section>

        <div className="lg:sticky lg:top-5">
          <FormulaireVersion courante={courante ?? null} />
        </div>
      </div>
    </>
  )
}

function Poste({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div className="flex justify-between gap-2.5">
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className="whitespace-nowrap">
        <Montant cents={valeur} niveau="courant" className="text-xs" />
      </dd>
    </div>
  )
}

/**
 * Le detail d'un poste de charges, une pastille par ligne de config.
 *
 * L'intitule est VISIBLE : trois groupes de pastilles identiques empiles
 * (communes, perso Thomas, perso Liz) sont indiscernables sans lui, et la
 * distinction commune/perso est precisement ce qui determine si une charge
 * entre ou non dans le calcul du prorata.
 */
function Pastilles({ libelle, charges }: { libelle: string; charges: Charge[] }) {
  if (charges.length === 0) return null
  return (
    <div className="mt-3">
      <h4 className="mb-1.5 text-[0.6875rem] tracking-[0.05em] text-faint uppercase">{libelle}</h4>
      <ul className="flex flex-wrap gap-1.5">
        {charges.map((c) => (
          <li
            key={c.libelle}
            className="inline-flex gap-1.5 rounded-sm border border-subtle bg-muted px-2 py-0.5 text-[0.6875rem] whitespace-nowrap text-body"
          >
            {c.libelle}
            <Montant cents={c.montant} niveau="discret" className="text-[0.6875rem] text-body" />
          </li>
        ))}
      </ul>
    </div>
  )
}
