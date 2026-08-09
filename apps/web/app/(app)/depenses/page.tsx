import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { LigneDepense } from '@/components/ligne-depense'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { type Personne, resumer, synthese } from '@homebudget/domain'
import { FiltresDepenses } from './filtres'
import { FormulaireDepense } from './formulaire-depense'
import { FormulaireGeneration } from './formulaire-generation'

export const dynamic = 'force-dynamic'

const PERSONNES: Personne[] = ['thomas', 'liz']

export default async function Depenses({
  searchParams,
}: {
  searchParams: Promise<{
    regler?: string | string[]
    mois?: string | string[]
    payePar?: string | string[]
  }>
}) {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const { regler, mois, payePar } = await searchParams

  const toutes = await listerDepenses()

  // Les mois OFFERTS sont ceux qui existent. Un selecteur qui proposerait un
  // mois vide inviterait a un filtre dont on sait deja qu'il ne rendra rien.
  // `toutes` est triee du plus recent au plus ancien, et `Set` garde cet ordre.
  const moisDisponibles = [...new Set(toutes.map((d) => d.date.slice(0, 7)))]

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

  // Filtrer SELECTIONNE des lignes ; ca ne change ni une part ni un solde. La
  // liste affichee est donc filtree, mais tout ce qui se calcule reste calcule
  // sur TOUTES les depenses — voir la synthese juste dessous.
  const depenses = filtre ? await listerDepenses(filtres) : toutes

  // `?regler=1` (issue #26) ne porte qu'un DRAPEAU, jamais le montant. La
  // synthese est rejouee ICI, sur les depenses deja chargees : zero requete de
  // plus, et le chiffre ne quitte jamais le serveur. Un montant passe par l'URL
  // serait fige au rendu du tableau de bord — donc perime des la depense
  // suivante — et serait une saisie utilisateur a valider.
  //
  // Sur `toutes`, jamais sur `depenses` : un solde calcule sur le seul mois
  // affiche est un reglement PARTIEL presente comme le solde. Filtrer l'ecran ne
  // doit pas pouvoir changer le montant qu'on s'apprete a virer.
  const s = synthese(resumer(toutes))
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
            filtre
              ? `${depenses.length} sur ${toutes.length}`
              : `${depenses.length} ${depenses.length > 1 ? 'dépenses' : 'dépense'}`
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
        </Carte>

        {/* `sticky` : la saisie reste a portee quand l'historique s'allonge.
            Neutralise sous lg, ou les deux colonnes s'empilent. */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-5">
          <FormulaireDepense personne={session.personne} reglement={reglement} />
          {/* Sous la saisie, et non au-dessus : on ouvre cet ecran pour saisir
              une depense, pas pour generer un loyer une fois par mois. */}
          <FormulaireGeneration personne={session.personne} />
        </div>
      </div>
    </>
  )
}
