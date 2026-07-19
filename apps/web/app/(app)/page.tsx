import { Montant } from '@/components/montant'
import { Section } from '@/components/section'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { type Resume, nomPersonne, resumer, synthese } from '@homebudget/domain'

// Le tableau de bord doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

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
  const s = synthese(resume)

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      {/* Le solde est la seule chose qui compte vraiment : il est traite comme
          tel. Pas de cadre, pas de fond — c'est l'echelle typographique qui
          porte la hierarchie. */}
      <section data-testid="bandeau-solde" className="flex flex-col gap-3 pt-4">
        <p data-testid="phrase-synthese" className="flex flex-col gap-3">
          {s.etat === 'a-jour' ? (
            <span className="font-heading text-[clamp(2rem,8vw,2.75rem)] leading-none">
              Vous êtes à jour
            </span>
          ) : (
            <>
              <span className="text-[0.8125rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {nomPersonne(s.debiteur)} doit à {nomPersonne(s.crediteur)}
              </span>
              {/* Montant ISOLE : c'est le seul endroit de l'app ou la serif
                  touche un chiffre. */}
              <Montant cents={s.montant} niveau="heros" />
            </>
          )}
        </p>
      </section>

      <Section titre="Mouvements">
        <dl className="flex flex-col gap-3">
          <Chiffre libelle="Dépensé total" valeur={resume.totalDepenses} />
          <Chiffre libelle="Transferts" valeur={resume.totalTransferts} />
        </dl>
      </Section>

      <Section titre="Par personne">
        <dl className="flex flex-col gap-3">
          <Chiffre libelle="Payé par Thomas" valeur={resume.payeThomas} discret />
          <Chiffre libelle="Payé par Liz" valeur={resume.payeLiz} discret />
          <Chiffre libelle="Dû par Thomas" valeur={resume.duThomas} discret />
          <Chiffre libelle="Dû par Liz" valeur={resume.duLiz} discret />
          {/* `signe` affiche le plus explicite. Les valeurs arrivent DEJA
              signees du domaine : rien ici ne les inverse. */}
          <Chiffre libelle="Solde Thomas" valeur={resume.soldeThomas} discret signe />
          <Chiffre libelle="Solde Liz" valeur={resume.soldeLiz} discret signe />
        </dl>
      </Section>
    </div>
  )
}

function Chiffre({
  libelle,
  valeur,
  discret = false,
  signe = false,
}: {
  libelle: string
  valeur: number
  discret?: boolean
  signe?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[0.9375rem] text-muted-foreground">{libelle}</dt>
      <dd>
        <Montant cents={valeur} niveau={discret ? 'discret' : 'notable'} signe={signe} />
      </dd>
    </div>
  )
}
