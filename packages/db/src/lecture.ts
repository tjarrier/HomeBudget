import type { Depense, VersionConfig } from '@homebudget/domain'
import { asc, desc } from 'drizzle-orm'
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
 * Toutes les depenses, de la plus recente a la plus ancienne.
 * Renvoie les lignes telles quelles : aucun agregat, aucune somme SQL. Le resume
 * du tableau de bord est `resumer()` du domaine, applique a ce tableau.
 *
 * `date` seule ne definit pas un ordre total : plusieurs depenses peuvent partager
 * la meme date, et l'ordre de retour de Postgres entre elles n'est pas garanti
 * d'un appel a l'autre. `createdAt` puis `id` referment ce tri pour qu'il soit
 * stable entre deux lectures : sans ca, un test qui compare le contenu de la
 * liste avant/apres une operation qui ne devrait rien changer (ex: creer une
 * nouvelle version de config) deviendrait flaky.
 */
export async function listerDepenses(): Promise<Depense[]> {
  const lignes = await db
    .select()
    .from(depense)
    .orderBy(desc(depense.date), desc(depense.createdAt), desc(depense.id))
  return lignes.map(depenseDepuisLigne)
}
