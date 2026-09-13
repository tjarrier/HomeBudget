import Link from 'next/link'

import { LigneDepense } from '@/components/ligne-depense'
import { Montant } from '@/components/montant'
import { exigerSession } from '@/lib/session'
import { lienOuvrirSaisie } from '@/lib/url-saisie'
import { listerDepenses, resumerDepenses } from '@homebudget/db'
import { nomPersonne, synthese } from '@homebudget/domain'

// L'accueil doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

export default async function Accueil() {
  // EN PREMIERE LIGNE, avant toute lecture. Le layout du groupe (app) appelle
  // deja `exigerSession()`, mais Next.js ne garantit pas de re-rendre un layout
  // a chaque requete d'un segment, et le middleware ne constate que la PRESENCE
  // du cookie. Cet ecran expose le solde : la garde vit ici.
  await exigerSession()

  // Deux lectures BORNEES : le solde est un agregat que Postgres plie, et
  // l'apercu ne descend que cinq lignes.
  const resume = await resumerDepenses()
  const recentes = await listerDepenses({ limite: 5 })
  const s = synthese(resume)

  return (
    <>
      {/* LA surface prune de l'application, reservee au seul chiffre qui compte.
          Elle est prune quel que soit le sens de la dette : la couleur est la
          marque, jamais un jugement. */}
      <section
        data-testid="bandeau-solde"
        className="flex flex-col rounded-2xl bg-emphasis p-5 text-on-emphasis"
      >
        {/* Le <h1> de l'ecran : l'accueil n'a pas d'autre titre, et
            `debordement.spec.ts` attend un <h1> visible sur chaque route. */}
        <h1 data-testid="phrase-synthese" className="flex flex-col">
          {s.etat === 'a-jour' ? (
            <span className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em]">
              Vous êtes à jour
            </span>
          ) : (
            <>
              <span className="text-sm font-semibold text-on-emphasis/72">
                {nomPersonne(s.debiteur)} doit à {nomPersonne(s.crediteur)}
              </span>
              <Montant cents={s.montant} niveau="heros" className="mt-1.5" />
            </>
          )}
        </h1>
        <p className="mt-1.5 text-[0.8125rem] text-on-emphasis/60">
          Sur {resume.nombre} {resume.nombre > 1 ? 'dépenses' : 'dépense'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Rien a regler, pas de lien : un lien inerte inviterait a creer un
              transfert de zero. */}
          {s.etat === 'dette' && (
            <Link
              href={lienOuvrirSaisie('/', new URLSearchParams(), 'regler')}
              scroll={false}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-on-emphasis/14 px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-on-emphasis focus-visible:outline-none"
            >
              Régler les comptes
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>
          )}
          <Link
            href="/tableau-de-bord"
            className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold text-on-emphasis/85 focus-visible:ring-2 focus-visible:ring-on-emphasis focus-visible:outline-none"
          >
            Voir le détail
          </Link>
        </div>
      </section>

      <div className="mt-7 mb-1.5 flex items-center justify-between">
        <h2 className="font-display text-[1.1875rem] font-semibold tracking-[-0.01em]">
          Dernières dépenses
        </h2>
        <Link
          href="/depenses"
          className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-marque focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Voir tout
        </Link>
      </div>

      <div className="rounded-xl bg-surface px-3.5 py-1 shadow-xs">
        {recentes.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Aucune dépense pour le moment.</p>
        ) : (
          <ul data-testid="dernieres-depenses">
            {recentes.map((d) => (
              <LigneDepense key={d.id} depense={d} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
