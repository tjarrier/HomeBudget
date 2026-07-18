import type { Depense, VersionConfig } from '@homebudget/domain'
import { asc, desc } from 'drizzle-orm'
import { db } from './client.js'
import { depenseDepuisLigne, versionDepuisLigne } from './mapper.js'
import { depense, versionConfig } from './schema.js'

/** Toutes les versions, de la plus ancienne a la plus recente. */
export async function listerVersions(): Promise<VersionConfig[]> {
  const lignes = await db.select().from(versionConfig).orderBy(asc(versionConfig.dateDebut))
  return lignes.map(versionDepuisLigne)
}

/**
 * Toutes les depenses, de la plus recente a la plus ancienne.
 * Renvoie les lignes telles quelles : aucun agregat, aucune somme SQL. Le resume
 * du tableau de bord est `resumer()` du domaine, applique a ce tableau.
 */
export async function listerDepenses(): Promise<Depense[]> {
  const lignes = await db.select().from(depense).orderBy(desc(depense.date))
  return lignes.map(depenseDepuisLigne)
}
