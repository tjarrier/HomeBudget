import type { Personne } from '@homebudget/domain'

export const MESSAGE_REFUS =
  "Cette adresse n'est pas autorisee. HomeBudget est un budget prive a deux personnes."

/**
 * Les deux seules adresses autorisees, lues a chaque appel (et non figees au
 * chargement du module) pour que les tests puissent les injecter.
 * Une entree vide n'ouvre rien : `''` n'est jamais une cle du mapping.
 */
function allowlist(): ReadonlyMap<string, Personne> {
  const entrees: Array<[string | undefined, Personne]> = [
    [process.env.ALLOWLIST_THOMAS, 'thomas'],
    [process.env.ALLOWLIST_LIZ, 'liz'],
  ]
  const map = new Map<string, Personne>()
  for (const [adresse, personne] of entrees) {
    const normalisee = adresse?.trim().toLowerCase()
    if (normalisee) map.set(normalisee, personne)
  }
  return map
}

/** Throw si l'adresse n'est pas l'une des deux autorisees. Il n'y a pas d'inscription. */
export function resoudrePersonne(email: string): Personne {
  const personne = allowlist().get(email.trim().toLowerCase())
  if (!personne) throw new Error(MESSAGE_REFUS)
  return personne
}

/**
 * Hook `databaseHooks.user.create.before` de Better Auth.
 * Sans RLS, c'est ici — et nulle part ailleurs — que se joue le controle d'acces.
 */
export async function avantCreationUtilisateur(user: {
  email: string
}): Promise<{ data: Record<string, unknown> }> {
  const personne = resoudrePersonne(user.email)
  return { data: { ...user, personne } }
}
