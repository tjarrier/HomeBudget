import Link from 'next/link'

import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { LigneDepense } from '@/components/ligne-depense'
import { buttonVariants } from '@/components/ui/button'
import { exigerSession } from '@/lib/session'
import { listerDepenses, listerMoisDepenses, resumerDepenses } from '@homebudget/db'
import type { Personne } from '@homebudget/domain'
import { FiltresDepenses } from './filtres'
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
    mois?: string | string[]
    payePar?: string | string[]
    n?: string | string[]
  }>
}) {
  // La personne de la session pre-remplit le payeur de la generation mensuelle :
  // c'est la raison d'etre de la colonne `user.personne`, posee par le hook
  // d'allowlist.
  const session = await exigerSession()
  const { mois, payePar, n } = await searchParams

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

  // Le compte de TOUTES les depenses, sans filtre : c'est le « sur N » de
  // l'entete sous un filtre, et le compte lui-meme sans filtre. Cet ecran
  // n'affiche plus aucun solde (le reglement est la feuille de saisie).
  const global = await resumerDepenses()
  // Le compte de ce qui CORRESPOND, qui n'est pas le compte de ce qui s'affiche :
  // c'est lui qui dit s'il reste quelque chose derriere la borne.
  const correspondantes = filtre ? (await resumerDepenses(filtres)).nombre : global.nombre

  const limite = borne(n, correspondantes)
  const depenses = await listerDepenses({ ...filtres, limite })
  const reste = correspondantes - depenses.length

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
            // Les parametres COURANTS sont repris : le filtre pose survit a un
            // « Voir plus ».
            <Link
              href={`?${new URLSearchParams({
                ...(filtres.mois ? { mois: filtres.mois } : {}),
                ...(filtres.payePar ? { payePar: filtres.payePar } : {}),
                n: String(limite + PALIER),
              })}`}
              data-testid="voir-plus"
              // `discret` : DESIGN.md dit deux variantes, pas plus. `w-full`
              // seul s'ajoute, pour occuper toute la largeur de la carte.
              className={buttonVariants({ variant: 'discret', className: 'mt-2 w-full' })}
            >
              {/* Le reste est DANS le libelle : « Voir plus » sans chiffre
                  n'apprend rien sur ce qu'il reste a parcourir. */}
              Voir plus ({reste})
            </Link>
          )}
        </Carte>

        {/* Au large, a cote de l'historique ; au telephone, dessous : on ouvre
            cet ecran pour relire l'historique, pas pour generer un loyer une
            fois par mois. La saisie, elle, est la feuille du « + ». */}
        <div className="lg:sticky lg:top-5">
          <FormulaireGeneration personne={session.personne} />
        </div>
      </div>
    </>
  )
}
