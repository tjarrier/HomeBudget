import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { Montant } from '@/components/montant'
import { exigerSession } from '@/lib/session'
import { resumerDepenses } from '@homebudget/db'
import { type Personne, type Resume, nomPersonne, synthese } from '@homebudget/domain'

// Le tableau de bord doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

/** Un pourcentage entier, sans jamais diviser par zero (base vide). */
function pourcent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

export default async function TableauDeBord() {
  // EN PREMIERE LIGNE, avant toute lecture : le layout ne garantit pas d'etre
  // re-rendu a chaque requete, et le middleware ne verifie que la presence du
  // cookie. Cet ecran expose le solde.
  await exigerSession()

  // Un agregat, AUCUNE ligne de depense : la borne de G2 ne s'applique pas ici.
  const resume: Resume = await resumerDepenses()
  const s = synthese(resume)

  const totalPaye = resume.payeThomas + resume.payeLiz
  const totalDu = resume.duThomas + resume.duLiz
  const pctThomas = pourcent(resume.payeThomas, totalPaye)

  return (
    <>
      <EntetePage titre="Tableau de bord" retour={{ href: '/', libelle: "Retour à l'accueil" }} />

      {/* Le rappel du solde. Pas de `phrase-synthese` ici : le canari lit
          l'accueil, et deux elements portant ce testid rendraient ses
          assertions ambigues. */}
      <section className="flex flex-col rounded-2xl bg-emphasis px-5 py-4 text-on-emphasis">
        <p className="text-[0.8125rem] font-semibold text-on-emphasis/72">
          {s.etat === 'a-jour'
            ? 'Vous êtes à jour'
            : `${nomPersonne(s.debiteur)} doit à ${nomPersonne(s.crediteur)}`}
        </p>
        {s.etat === 'dette' ? (
          <Montant
            cents={s.montant}
            niveau="heros"
            className="mt-1"
            testId="solde-tableau-de-bord"
          />
        ) : null}
        <p className="mt-1 text-[0.8125rem] text-on-emphasis/60">
          Sur {resume.nombre} {resume.nombre > 1 ? 'dépenses' : 'dépense'}
        </p>
      </section>

      <h2 className="mt-7 mb-2.5 font-display text-[1.1875rem] font-semibold tracking-[-0.01em]">
        Vue d’ensemble
      </h2>
      {/* `grid-cols-2` vaut `repeat(2, minmax(0, 1fr))` : chaque colonne est
          bornee par la place disponible, les montants insecables ne poussent pas
          la grille au-dela de 360px (issue C2). */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Chiffre libelle="Total dépensé" valeur={resume.totalDepenses} sous="Transferts exclus" />
        <Chiffre libelle="Transferts" valeur={resume.totalTransferts} sous="Virements et remb." />
        <Chiffre
          libelle="Dû par Thomas"
          valeur={resume.duThomas}
          sous={`${pourcent(resume.duThomas, totalDu)} % des charges`}
        />
        <Chiffre
          libelle="Dû par Liz"
          valeur={resume.duLiz}
          sous={`${pourcent(resume.duLiz, totalDu)} % des charges`}
        />
      </div>

      <Carte titre="Répartition" className="mt-7">
        <div className="flex flex-col divide-y divide-subtle">
          <BilanPersonne
            personne="thomas"
            paye={resume.payeThomas}
            du={resume.duThomas}
            solde={resume.soldeThomas}
            pct={pctThomas}
          />
          <BilanPersonne
            personne="liz"
            paye={resume.payeLiz}
            du={resume.duLiz}
            solde={resume.soldeLiz}
            pct={100 - pctThomas}
          />
        </div>
      </Carte>
    </>
  )
}

function Chiffre({ libelle, valeur, sous }: { libelle: string; valeur: number; sous: string }) {
  return (
    <div className="rounded-lg bg-surface p-3.5 shadow-xs">
      <div className="text-[0.8125rem] font-semibold text-muted-foreground">{libelle}</div>
      <div className="mt-1.5 whitespace-nowrap">
        <Montant cents={valeur} niveau="notable" />
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sous}</div>
    </div>
  )
}

/**
 * Le bilan d'une personne. `solde` arrive DEJA signe du domaine : rien ici ne
 * l'inverse ni ne le teinte. Les deux barres ont la meme couleur : aucune
 * couleur par personne.
 */
function BilanPersonne({
  personne,
  paye,
  du,
  solde,
  pct,
}: {
  personne: Personne
  paye: number
  du: number
  solde: number
  pct: number
}) {
  return (
    <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <span className="text-[0.9375rem] font-bold">{nomPersonne(personne)}</span>
        <span className="ml-auto text-[0.8125rem] text-muted-foreground">
          a payé <Montant cents={paye} niveau="courant" className="text-strong" />
        </span>
      </div>

      {/* Purement decorative : le pourcentage est ecrit en clair dessous. */}
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
        <i className="block h-full rounded-full bg-marque" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">{pct} % du total payé</div>

      <dl className="flex flex-col gap-1 text-[0.84375rem]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Aurait dû payer</dt>
          <dd>
            <Montant cents={du} niveau="courant" className="font-semibold" />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Solde</dt>
          <dd>
            <Montant cents={solde} niveau="courant" signe testId={`solde-${personne}`} />
          </dd>
        </div>
      </dl>
    </div>
  )
}
