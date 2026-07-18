import type { Personne } from '@homebudget/domain'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth.js'

export interface SessionActive {
  userId: string
  personne: Personne
  nom: string
}

/**
 * Exige une session valide. Redirige vers /login sinon.
 * Appele par le layout du groupe (app) ET en tete de chaque Server Action
 * d'ecriture : une Server Action est un endpoint HTTP, joignable sans page.
 */
export async function exigerSession(): Promise<SessionActive> {
  const s = await auth.api.getSession({ headers: await headers() })
  if (!s) redirect('/login')

  const personne = (s.user as { personne?: Personne }).personne
  if (personne !== 'thomas' && personne !== 'liz') {
    // Un compte sans personne n'aurait pas du exister : le hook d'allowlist la
    // pose a la creation. S'il y en a un, il ne passe pas.
    redirect('/login?erreur=compte-incomplet')
  }

  return { userId: s.user.id, personne, nom: s.user.name }
}
