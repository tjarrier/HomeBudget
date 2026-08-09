import {
  type Depense,
  type Personne,
  type TypeDepense,
  type VersionConfig,
  assertMoisIsoValide,
} from '@homebudget/domain'
import { type SQL, and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from './client.js'
import { depenseDepuisLigne, versionDepuisLigne } from './mapper.js'
import { depense, versionConfig } from './schema.js'

/**
 * Toutes les versions, de la plus ancienne a la plus recente.
 * Tri deja total sans tiebreaker : `versions_sans_chevauchement` (EXCLUDE USING
 * gist sur le daterange) interdit a deux versions de partager `date_debut`,
 * bornes incluses — deux lignes ne peuvent donc jamais etre ex aequo ici.
 */
export async function listerVersions(): Promise<VersionConfig[]> {
  const lignes = await db.select().from(versionConfig).orderBy(asc(versionConfig.dateDebut))
  return lignes.map(versionDepuisLigne)
}

/**
 * Les depenses, de la plus recente a la plus ancienne. Sans filtre : toutes.
 * Renvoie les lignes telles quelles : aucun agregat, aucune somme SQL. Le resume
 * du tableau de bord est `resumer()` du domaine, applique a ce tableau.
 *
 * Les filtres SELECTIONNENT des lignes, ils n'en changent aucune : les parts
 * restent celles figees a l'ecriture (regle 4). Un filtre qui recalculerait une
 * part — ou qui reprorratiserait un total sur le sous-ensemble retenu — serait
 * le bug du Sheet.
 *
 * `date` seule ne definit pas un ordre total : plusieurs depenses peuvent partager
 * la meme date, et l'ordre de retour de Postgres entre elles n'est pas garanti
 * d'un appel a l'autre. `createdAt` puis `id` referment ce tri pour qu'il soit
 * stable entre deux lectures : sans ca, un test qui compare le contenu de la
 * liste avant/apres une operation qui ne devrait rien changer (ex: creer une
 * nouvelle version de config) deviendrait flaky.
 */
export async function listerDepenses(filtres: FiltresDepenses = {}): Promise<Depense[]> {
  const lignes = await db
    .select()
    .from(depense)
    .where(and(...conditions(filtres)))
    .orderBy(desc(depense.date), desc(depense.createdAt), desc(depense.id))
  return lignes.map(depenseDepuisLigne)
}

/**
 * Criteres de selection. Absent = pas de filtre ; plusieurs = ET.
 *
 * `| undefined` explicite malgre le `?` : sous `exactOptionalPropertyTypes`, les
 * deux ne sont pas la meme chose. Un appelant qui derive ses filtres d'une URL
 * ecrit naturellement `{ mois: valide(param) }` — la propriete est PRESENTE et
 * vaut `undefined`. Sans cette union il devrait construire l'objet clef par clef
 * pour dire exactement ce que `conditions()` fait deja : `undefined` ne filtre rien.
 */
export interface FiltresDepenses {
  /** ISO `YYYY-MM`. Le mois de la DATE de la depense, jamais celui de sa saisie. */
  mois?: string | undefined
  /**
   * Qui a AVANCE l'argent. Ce n'est pas « les depenses qui concernent X » :
   * toute depense concerne les deux, chacun y porte une part (parfois nulle).
   */
  payePar?: Personne | undefined
  type?: TypeDepense | undefined
}

/**
 * `and()` sans argument rend `undefined`, et `.where(undefined)` ne filtre rien :
 * le cas « aucun filtre » n'a donc pas de branche a lui.
 *
 * Le mois se compare par `date_trunc`, la MEME expression que l'index partiel de
 * la migration 0008 — une seule definition de « le mois de cette date » dans le
 * projet. Elle empeche l'index sur `date` de servir ; a l'echelle du couple
 * (quelques centaines de lignes) c'est sans effet mesurable, et une borne
 * `>= / <` reintroduirait une arithmetique de calendrier a tenir juste.
 */
function conditions(filtres: FiltresDepenses): SQL[] {
  const retenues: SQL[] = []
  if (filtres.mois !== undefined) {
    // Valider ici et non laisser Postgres jeter sur le cast : la facade est la
    // frontiere, et « 2026-13 » doit se voir dire ce qu'on attendait.
    assertMoisIsoValide(filtres.mois)
    retenues.push(
      sql`date_trunc('month', ${depense.date}::timestamp) = ${`${filtres.mois}-01`}::date::timestamp`,
    )
  }
  if (filtres.payePar !== undefined) retenues.push(eq(depense.payePar, filtres.payePar))
  if (filtres.type !== undefined) retenues.push(eq(depense.type, filtres.type))
  return retenues
}
