import {
  type Cents,
  type Charge,
  type Depense,
  type ModeRepartition,
  type Parts,
  type Personne,
  type TypeDepense,
  type VersionConfig,
  calculerParts,
  ratioThomas,
  verifierDatePlausible,
  versionEnVigueurLe,
} from '@homebudget/domain'
import { eq, sql } from 'drizzle-orm'
import { db } from './client.js'
import { listerVersions } from './lecture.js'
import { depenseDepuisLigne, versionDepuisLigne } from './mapper.js'
import { depense, versionConfig } from './schema.js'

export interface SaisieDepense {
  /** ISO YYYY-MM-DD. */
  date: string
  description: string
  /** Deja en centimes entiers : aucun flottant n'atteint cette fonction. */
  montant: Cents
  payePar: Personne
  type: TypeDepense
  mode: ModeRepartition
  /** Requis si et seulement si mode === 'personnalise'. */
  partsPersonnalisees?: Parts
  commentaire?: string
}

export interface PartsCalculees {
  parts: Parts
  version: VersionConfig
}

/**
 * Aujourd'hui, en date ISO, d'apres l'horloge du SERVEUR.
 *
 * Volontairement NON exporte : `index.ts` fait `export *`, et la facade de
 * `packages/db` est une liste blanche verrouillee par
 * `apps/web/test/architecture.test.ts`. Rien a y ajouter pour cette regle.
 *
 * Lit l'horloge, donc impur — d'ou sa place ici et non dans le domaine, qui
 * recoit toujours `aujourdhui` en parametre. Le serveur peut tourner en UTC
 * pendant qu'on saisit a Paris : sur une fenetre d'un AN, un decalage de
 * quelques heures est sans consequence.
 */
function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Le coeur de I2, extrait pour etre partage par l'ECRITURE et l'APERCU.
 * Meme code des deux cotes : un apercu qui divergerait de l'ecriture serait un
 * mensonge affiche a l'utilisateur.
 *
 * `versionEnVigueurLe(versions, saisie.date)` — et JAMAIS la version courante.
 * Voir le commentaire de la migration 0004.
 */
export function calculerPartsPourSaisie(
  saisie: SaisieDepense,
  versions: VersionConfig[],
  aujourdhui: string = aujourdhuiIso(),
): PartsCalculees {
  // Les DEUX bornes de la fenetre plausible, cote a cote :
  // - haute : plus d'un an dans l'avenir, c'est une coquille d'annee (#29) ;
  // - basse : anterieure a toute version, aucune regle n'est applicable.
  // Ancre ICI et non dans `normaliser()` cote web, parce que `ajouterDepense`
  // est joignable sans passer par le formulaire (tests, seed, futur import) :
  // c'est la facade elle-meme qu'il faut proteger.
  verifierDatePlausible(saisie.date, aujourdhui)
  const version = versionEnVigueurLe(versions, saisie.date)
  // `exactOptionalPropertyTypes` : on ne pose la cle que si elle a une valeur.
  const parts = calculerParts({
    montant: saisie.montant,
    mode: saisie.mode,
    payePar: saisie.payePar,
    ratioThomas: ratioThomas(version),
    ...(saisie.partsPersonnalisees ? { partsPersonnalisees: saisie.partsPersonnalisees } : {}),
  })
  return { parts, version }
}

/**
 * Fige une depense. Les gardes du domaine et les contraintes SQL jettent :
 * l'appelant (une Server Action) attrape et traduit pour l'humain.
 */
export async function ajouterDepense(saisie: SaisieDepense): Promise<Depense> {
  const versions = await listerVersions()
  const { parts, version } = calculerPartsPourSaisie(saisie, versions)

  const lignes = await db
    .insert(depense)
    .values({
      date: saisie.date,
      description: saisie.description,
      montantCents: saisie.montant,
      payePar: saisie.payePar,
      type: saisie.type,
      modeRepartition: saisie.mode,
      partThomasCents: parts.thomas,
      partLizCents: parts.liz,
      // Le trigger `depense_dans_sa_version` REVERIFIE que cette version
      // couvre bien saisie.date. Deux filets, jamais un seul.
      versionConfigId: version.id,
      genereAuto: false,
      commentaire: saisie.commentaire ?? null,
    })
    .returning()

  const ligne = lignes[0]
  if (!ligne) throw new Error("L'insertion de la depense n'a rien renvoye.")
  return depenseDepuisLigne(ligne)
}

export interface SaisieVersion {
  libelle: string
  /** ISO YYYY-MM-DD : date de prise d'effet. */
  dateDebut: string
  salaireNetThomas: Cents
  salaireNetLiz: Cents
  chargesCommunes: Charge[]
  chargesPersoThomas: Charge[]
  chargesPersoLiz: Charge[]
}

/**
 * Cree une version. Delegue a `creer_version_config()`, qui cloture la
 * precedente LA VEILLE et insere la nouvelle en une seule transaction.
 * On ne reimplemente pas cette logique ici : c'est le point de passage oblige
 * de l'append-only, et il vit en SQL.
 */
export async function creerVersion(saisie: SaisieVersion): Promise<VersionConfig> {
  const { rows } = await db.execute<{ id: string }>(sql`
    select * from creer_version_config(
      ${saisie.libelle},
      ${saisie.dateDebut}::date,
      ${saisie.salaireNetThomas},
      ${saisie.salaireNetLiz},
      ${JSON.stringify(saisie.chargesCommunes)}::jsonb,
      ${JSON.stringify(saisie.chargesPersoThomas)}::jsonb,
      ${JSON.stringify(saisie.chargesPersoLiz)}::jsonb
    )
  `)
  const ligne = rows[0]
  if (!ligne) throw new Error("creer_version_config n'a rien renvoye.")
  // `db.execute` rend les colonnes SQL brutes (snake_case : `date_fin`,
  // `salaire_net_thomas_cents`...), pas le vocabulaire camelCase de Drizzle
  // qu'attend `versionDepuisLigne` : verifie empiriquement, `nouvelle.dateFin`
  // ressort `undefined` au lieu de `null` sans cette relecture. On relit donc
  // la ligne par son id via `db.select()`, pour ne garder qu'un seul
  // vocabulaire de colonnes dans le mapper.
  const relues = await db.select().from(versionConfig).where(eq(versionConfig.id, ligne.id))
  const relue = relues[0]
  if (!relue) throw new Error("La version creee n'a pas ete retrouvee a la relecture.")
  return versionDepuisLigne(relue)
}
