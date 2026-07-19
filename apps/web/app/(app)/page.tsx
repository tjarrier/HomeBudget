import { formaterMontant } from '@/lib/format'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { type Resume, phraseSynthese, resumer } from '@homebudget/domain'

// Le tableau de bord doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

function Chiffre({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs text-slate-500">{libelle}</dt>
      <dd className="text-lg font-semibold tabular-nums">{formaterMontant(valeur)}</dd>
    </div>
  )
}

export default async function TableauDeBord() {
  // EN PREMIERE LIGNE, avant toute lecture. Le layout du groupe (app) appelle
  // deja `exigerSession()`, mais Next.js ne garantit pas de re-rendre un layout
  // a chaque requete d'un segment : sa documentation deconseille explicitement
  // le controle d'acces en layout. Le middleware ne rattrape pas non plus — il
  // constate la PRESENCE du cookie, sans en verifier la signature. Cet ecran
  // expose le solde : la garde vit ici, le layout n'est que la profondeur.
  await exigerSession()

  // Les lignes sont lues telles quelles ; le calcul est fait par le domaine, ici,
  // en TypeScript. Aucun SELECT n'additionne de solde.
  const resume: Resume = resumer(await listerDepenses())

  return (
    <div className="flex flex-col gap-6">
      <section
        data-testid="bandeau-solde"
        className="rounded-xl bg-slate-900 p-6 text-center text-white"
      >
        <p className="text-sm opacity-80">Qui doit quoi</p>
        <p className="mt-2 text-xl font-medium" data-testid="phrase-synthese">
          {phraseSynthese(resume)}
        </p>
      </section>

      <dl className="grid grid-cols-2 gap-3">
        <Chiffre libelle="Total dépensé" valeur={resume.totalDepenses} />
        <Chiffre libelle="Total transferts" valeur={resume.totalTransferts} />
        <Chiffre libelle="Payé par Thomas" valeur={resume.payeThomas} />
        <Chiffre libelle="Payé par Liz" valeur={resume.payeLiz} />
        <Chiffre libelle="Dû par Thomas" valeur={resume.duThomas} />
        <Chiffre libelle="Dû par Liz" valeur={resume.duLiz} />
        <Chiffre libelle="Solde Thomas" valeur={resume.soldeThomas} />
        <Chiffre libelle="Solde Liz" valeur={resume.soldeLiz} />
      </dl>
    </div>
  )
}
