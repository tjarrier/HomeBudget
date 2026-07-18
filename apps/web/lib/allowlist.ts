import type { Personne } from '@homebudget/domain'
import { APIError } from 'better-auth/api'

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
  // Deux adresses distinctes mais configurees identiques : `map.set` ecraserait
  // silencieusement la premiere et Thomas se retrouverait connecte comme Liz (ou
  // l'inverse). Une entree vide, elle, est un choix legitime (porte fermee) : ne
  // pas la compter ici. Ne throw donc que si des adresses non vides sont entrees
  // en double.
  const nonVides = entrees.filter(([adresse]) => adresse?.trim())
  if (map.size !== nonVides.length) {
    throw new Error(
      'Allowlist mal configuree : ALLOWLIST_THOMAS et ALLOWLIST_LIZ pointent vers la meme adresse.',
    )
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
 *
 * `resoudrePersonne` reste une fonction pure (elle throw une `Error` ordinaire) :
 * c'est ce hook, seul point de contact avec Better Auth, qui traduit le refus en
 * `APIError`. Better Auth ne distingue une erreur controlee (reponse/redirection
 * lisible) d'un throw inattendu (500 generique) que via `APIError` — un `Error`
 * nu ne serait jamais presente a la personne qu'on refuse.
 */
export async function avantCreationUtilisateur(user: {
  email: string
}): Promise<{ data: Record<string, unknown> }> {
  let personne: Personne
  try {
    personne = resoudrePersonne(user.email)
  } catch {
    throw new APIError('FORBIDDEN', { message: MESSAGE_REFUS })
  }
  return { data: { ...user, personne } }
}
