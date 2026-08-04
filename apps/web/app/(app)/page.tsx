import Link from 'next/link'

import { Avatar } from '@/components/avatar'
import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { LigneDepense } from '@/components/ligne-depense'
import { Montant } from '@/components/montant'
import { buttonVariants } from '@/components/ui/button'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { type Personne, type Resume, nomPersonne, resumer, synthese } from '@homebudget/domain'

// Le tableau de bord doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

/** Un pourcentage entier, sans jamais diviser par zero (base vide). */
function pourcent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
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
  const depenses = await listerDepenses()
  const resume: Resume = resumer(depenses)
  const s = synthese(resume)

  const totalPaye = resume.payeThomas + resume.payeLiz
  const totalDu = resume.duThomas + resume.duLiz
  const pctThomas = pourcent(resume.payeThomas, totalPaye)

  return (
    <>
      <EntetePage titre="Tableau de bord" sousTitre="Vue d’ensemble du budget partagé" />

      {/* LA surface sombre de l'application. Elle est reservee au seul chiffre
          qui compte — qui doit quoi. Lui en adjoindre une seconde ailleurs
          detruirait la hierarchie qu'elle porte. */}
      <section
        data-testid="bandeau-solde"
        className="flex flex-col gap-4 rounded-xl bg-emphasis px-7 py-6 text-on-emphasis"
      >
        <div>
          <h2 className="text-xs tracking-[0.08em] text-on-emphasis/55 uppercase">Qui doit quoi</h2>
          <p data-testid="phrase-synthese" className="mt-1.5 leading-tight">
            {s.etat === 'a-jour' ? (
              <span className="text-3xl font-semibold tracking-[-0.02em]">Vous êtes à jour</span>
            ) : (
              <span className="text-3xl font-semibold tracking-[-0.02em]">
                {nomPersonne(s.debiteur)} doit <Montant cents={s.montant} niveau="heros" /> à{' '}
                {nomPersonne(s.crediteur)}
              </span>
            )}
          </p>
        </div>

        <div>
          {/* Purement decoratif : les deux pourcentages sont ecrits en toutes
              lettres juste dessous. */}
          <div
            aria-hidden="true"
            className="mt-0.5 flex h-2 overflow-hidden rounded-full bg-on-emphasis/15"
          >
            <i className="block bg-on-emphasis/85" style={{ width: `${pctThomas}%` }} />
            <i className="block bg-on-emphasis/35" style={{ width: `${100 - pctThomas}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[0.6875rem] text-on-emphasis/60">
            <span>Thomas a payé {pctThomas} %</span>
            <span>Liz a payé {100 - pctThomas} %</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-on-emphasis/12 pt-4 text-xs text-on-emphasis/60">
          <span className="rounded-full bg-on-emphasis/12 px-2.5 py-1 font-medium text-on-emphasis">
            {s.etat === 'a-jour'
              ? 'Comptes équilibrés'
              : `Solde en faveur de ${nomPersonne(s.crediteur)}`}
          </span>
          <span>
            Sur {depenses.length} {depenses.length > 1 ? 'dépenses' : 'dépense'}
          </span>
        </div>
      </section>

      {/* Sous le bandeau, jamais dedans : `bg-emphasis` est le SEUL aplat sombre
          du systeme et il est ecrit pour ne porter qu'une chose (DESIGN.md).
          Aucune des deux variantes de Button n'y tient — `primaire` serait
          slate-900 sur slate-900 — et DESIGN.md dit « deux variantes, pas plus ».
          Ici, `discret` fonctionne tel quel et `min-h-11` vient avec.

          Rien a regler, pas de bouton : un bouton inerte inviterait a creer un
          transfert de zero. */}
      {s.etat === 'dette' && (
        <Link
          href="/depenses?regler=1"
          className={buttonVariants({ variant: 'discret', className: 'mt-5' })}
        >
          Régler les comptes
        </Link>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Chiffre libelle="Total dépensé" valeur={resume.totalDepenses} sous="Transferts exclus" />
        <Chiffre libelle="Transferts" valeur={resume.totalTransferts} sous="Virements & remb." />
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

      {/* `grid-cols-1` n'est PAS decoratif : sans template explicite, la colonne
          implicite d'une grille vaut `auto`, donc au moins le max-content de ses
          items — une carte pleine de montants insecables pousse alors la grille
          au-dela de l'ecran. `grid-cols-1` vaut `minmax(0,1fr)` : la colonne est
          bornee par la place disponible, et le contenu retrecit. C'est la cause
          unique de l'issue C2. */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Carte titre="Répartition" aside="Payé vs dû">
          <div className="flex flex-col gap-5">
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

        <Carte
          titre="Dépenses récentes"
          aside={
            <Link
              href="/depenses"
              // Le seul controle de l'app qui ne soit ni un bouton ni un champ,
              // et le seul dont la cible se lisait dans la taille du texte :
              // 63x15px, intouchable au pouce. `min-h-11` la porte au plancher
              // du projet ; `-my-3` empeche ces 44px de repousser le titre de
              // la carte — la zone touchable grandit, la mise en page ne bouge
              // pas. `px-2 -mr-2` fait la meme chose en largeur, sans decaler
              // le texte du bord droit.
              className="-my-3 -mr-2 inline-flex min-h-11 items-center px-2 font-medium hover:text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Voir tout →
            </Link>
          }
        >
          {depenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune dépense pour le moment.</p>
          ) : (
            <ul>
              {depenses.slice(0, 5).map((d) => (
                <LigneDepense key={d.id} depense={d} avecPayeur={false} />
              ))}
            </ul>
          )}
        </Carte>
      </div>
    </>
  )
}

function Chiffre({ libelle, valeur, sous }: { libelle: string; valeur: number; sous: string }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface px-4 py-3.5 shadow-xs">
      <div className="text-[0.6875rem] tracking-[0.05em] text-faint uppercase">{libelle}</div>
      <div className="mt-1.5 whitespace-nowrap">
        <Montant cents={valeur} niveau="notable" />
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sous}</div>
    </div>
  )
}

/**
 * Le bilan d'une personne. `solde` arrive DEJA signe du domaine : rien ici ne
 * l'inverse ni ne le teinte (voir `components/montant.tsx`).
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
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar personne={personne} decoratif />
        <span className="text-sm font-semibold">{nomPersonne(personne)}</span>
        <span className="ml-auto">
          <Montant cents={paye} niveau="courant" />
        </span>
      </div>

      <div>
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
          <i className="block h-full rounded-full bg-body" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-[0.6875rem] text-faint">{pct} % du total payé</div>
      </div>

      <dl className="text-xs">
        <div className="flex justify-between border-t border-subtle py-1">
          <dt className="text-muted-foreground">Aurait dû payer</dt>
          <dd>
            <Montant cents={du} niveau="courant" className="text-xs" />
          </dd>
        </div>
        <div className="flex justify-between border-t border-subtle py-1">
          <dt className="text-muted-foreground">Solde</dt>
          <dd>
            <Montant cents={solde} niveau="courant" className="text-xs" signe />
          </dd>
        </div>
      </dl>
    </div>
  )
}
