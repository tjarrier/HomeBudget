import Link from 'next/link'

import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { LigneDepense } from '@/components/ligne-depense'
import { exigerSession } from '@/lib/session'
import { listerDepenses, listerMoisDepenses, resumerDepenses } from '@homebudget/db'
import { type Personne, synthese } from '@homebudget/domain'
import { FiltresDepenses } from './filtres'
import { FormulaireDepense } from './formulaire-depense'
import { FormulaireGeneration } from './formulaire-generation'

export const dynamic = 'force-dynamic'

const PERSONNES: Personne[] = ['thomas', 'liz']

/**
 * Le palier de « Voir plus ». 20 lignes tiennent sur un ecran de telephone sans
 * en faire une page de 4 000px (issue #41), et le pas est le meme que la borne
 * initiale : il n'y a qu'un chiffre a retenir.
 */
const PALIER = 20

/**
 * `?n` est une SAISIE, validee comme les filtres : retenue seulement si elle est
 * l'une des valeurs auxquelles « Voir plus » a pu mener — un multiple du palier,
 * au moins un palier, au plus le premier palier qui couvre tout. Un `?n=999999`
 * tape a la main ne doit pas pouvoir deborner la lecture.
 */
function borne(brut: string | string[] | undefined, total: number): number {
  const demande = Number(Array.isArray(brut) ? brut[0] : brut)
  if (!Number.isInteger(demande) || demande < PALIER || demande % PALIER !== 0) return PALIER
  return Math.min(demande, Math.ceil(total / PALIER) * PALIER)
}

export default async function Depenses({
  searchParams,
}: {
  searchParams: Promise<{
    regler?: string | string[]
    mois?: string | string[]
    payePar?: string | string[]
    n?: string | string[]
  }>
}) {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const { regler, mois, payePar, n } = await searchParams

  // Les mois OFFERTS sont ceux qui existent, demandes a la base et non deduits
  // des lignes affichees : sous une borne, la liste ne connait plus que ses 20
  // premieres, et le selecteur ne proposerait plus que les mois recents.
  const moisDisponibles = await listerMoisDepenses()

  // Un parametre d'URL est une saisie. Il n'est retenu que s'il fait partie de
  // ce que l'ecran propose ; sinon on l'ignore, et le selecteur affiche « Tous »
  // — le controle et la liste disent alors la meme chose. C'est aussi ce qui
  // protege `assertMoisIsoValide` (facade) d'un « 2026-13 » tape a la main, qui
  // ferait une erreur 500 la ou il n'y a qu'une URL bricolee.
  // Les deux filtres se valident de la meme facon : « est-ce l'une des valeurs
  // que le selecteur propose ? ». `find` rend la valeur DE LA LISTE, donc deja
  // typee `Personne` — un `payePar === 'thomas' || …` ne narrowerait pas, la
  // valeur d'URL pouvant aussi etre un tableau (`?payePar=a&payePar=b`).
  const filtres = {
    mois: moisDisponibles.find((m) => m === mois),
    payePar: PERSONNES.find((p) => p === payePar),
  }
  const filtre = filtres.mois !== undefined || filtres.payePar !== undefined

  // Le solde est calcule sur TOUT, jamais sur ce qui est affiche — ni le filtre
  // ni la borne ne le touchent. Un solde calcule sur les lignes visibles serait
  // un reglement PARTIEL presente comme le solde.
  const global = await resumerDepenses()
  // Le compte de ce qui CORRESPOND, qui n'est pas le compte de ce qui s'affiche :
  // c'est lui qui dit s'il reste quelque chose derriere la borne.
  const correspondantes = filtre ? (await resumerDepenses(filtres)).nombre : global.nombre

  const limite = borne(n, correspondantes)
  const depenses = await listerDepenses({ ...filtres, limite })
  const reste = correspondantes - depenses.length

  // `?regler=1` (issue #26) ne porte qu'un DRAPEAU, jamais le montant. Le
  // chiffre ne quitte jamais le serveur. Un montant passe par l'URL serait fige
  // au rendu de cet ecran — donc perime des la depense suivante — et serait une
  // saisie utilisateur a valider.
  const s = synthese(global)
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
        {/* Le compte dit « sur combien » des qu'un filtre est pose : sans lui, une
            liste courte ne se distingue pas d'une base presque vide. */}
        <Carte
          titre="Historique"
          aside={
            reste > 0
              ? `${depenses.length} sur ${correspondantes}`
              : filtre
                ? `${correspondantes} sur ${global.nombre}`
                : `${correspondantes} ${correspondantes > 1 ? 'dépenses' : 'dépense'}`
          }
        >
          {/* HORS du `data-testid` : les intitules des options (« juillet 2026 »)
              entreraient sinon dans le texte que les parcours comparent. */}
          <FiltresDepenses
            mois={filtres.mois}
            payePar={filtres.payePar}
            moisDisponibles={moisDisponibles}
          />

          <div data-testid="liste-depenses">
            {depenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {/* Le message suit le filtre. « Aucune dépense pour le moment »
                    sous un filtre serait faux : la base en a, c'est la selection
                    qui est vide. */}
                {filtre
                  ? 'Aucune dépense ne correspond à ce filtre.'
                  : 'Aucune dépense pour le moment.'}
              </p>
            ) : (
              <ul>
                {depenses.map((d) => (
                  <LigneDepense key={d.id} depense={d} supprimable />
                ))}
              </ul>
            )}
          </div>

          {reste > 0 && (
            // Un <Link> et non un bouton : la borne est dans l'URL, donc elle
            // se partage et survit a un rechargement. Zero JavaScript de plus
            // sur un ecran qui n'en avait que pour les selecteurs.
            // Les parametres COURANTS sont repris : le filtre pose et
            // `?regler=1` (#26) survivent a un « Voir plus ».
            <Link
              href={`?${new URLSearchParams({
                ...(filtres.mois ? { mois: filtres.mois } : {}),
                ...(filtres.payePar ? { payePar: filtres.payePar } : {}),
                ...(regler ? { regler: '1' } : {}),
                n: String(limite + PALIER),
              })}`}
              data-testid="voir-plus"
              // min-h-11 : le plancher tactile du projet. Pleine largeur, donc
              // atteignable au pouce sans viser.
              className="mt-2 flex min-h-11 items-center justify-center rounded-lg border border-subtle text-sm font-medium hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {/* Le reste est DANS le libelle : « Voir plus » sans chiffre
                  n'apprend rien sur ce qu'il reste a parcourir. */}
              Voir plus ({reste})
            </Link>
          )}
        </Carte>

        {/* `sticky` : la saisie reste a portee quand l'historique s'allonge.
            Neutralise sous lg, ou les deux colonnes s'empilent.

            `max-lg:order-first` : au telephone, ouvrir cet ecran c'est etre deja
            DANS le formulaire — la ligne saisie apparait juste en dessous. Sans
            lui, saisir une depense demandait de traverser tout l'historique
            (issue #41). Au large, ou les deux colonnes coexistent, rien ne bouge. */}
        <div className="flex flex-col gap-6 max-lg:order-first lg:sticky lg:top-5">
          <FormulaireDepense personne={session.personne} reglement={reglement} />
          {/* Sous la saisie, et non au-dessus : on ouvre cet ecran pour saisir
              une depense, pas pour generer un loyer une fois par mois. */}
          <FormulaireGeneration personne={session.personne} />
        </div>
      </div>
    </>
  )
}
