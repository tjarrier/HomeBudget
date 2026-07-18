import { randomUUID } from 'node:crypto'
import { db, session, utilisateur } from '@homebudget/db'
import type { Personne } from '@homebudget/domain'
import { makeSignature } from 'better-auth/crypto'

const ADRESSES: Record<Personne, string> = {
  thomas: process.env.ALLOWLIST_THOMAS ?? 'thomas@exemple.fr',
  liz: process.env.ALLOWLIST_LIZ ?? 'liz@exemple.fr',
}

/**
 * Cree un utilisateur autorise et une session valide, puis renvoie la valeur du
 * cookie que Better Auth attend : `<token>.<signature HMAC du secret>`.
 *
 * On passe par la base plutot que par un provider de test : ajouter un second
 * chemin d'authentification au code de production contournerait l'allowlist,
 * qui est la seule frontiere de securite du projet.
 *
 * `better-auth/crypto` n'exporte PAS `createHMAC` (verifie empiriquement : ce
 * nom vit dans `@better-auth/utils/hmac`, un sous-paquet interne, jamais dans
 * `better-auth/crypto`). Et meme corrige, `createHMAC('SHA-256',
 * 'base64urlnopad')` ne conviendrait pas : le cookie `better-auth.session_token`
 * n'est PAS verifie avec ce HMAC-la a l'arrivee, mais par `ctx.getSignedCookie`
 * de `better-call`, qui exige une signature HMAC-SHA256 en base64 STANDARD (44
 * caracteres, terminee par `=`) — pas du base64url sans padding (43
 * caracteres, jamais accepte : rejete avant meme la verification cryptographique).
 * `makeSignature`, exporte par `better-auth/crypto`, produit exactement ce
 * format ; c'est la fonction que `better-auth/plugins/test-utils` utilise en
 * interne pour signer un cookie de session de test. Verifie contre
 * `better-call`'s `getSignedCookie` avant d'ecrire ce fichier.
 *
 * `onConflictDoUpdate` plutot qu'un simple `insert` : chaque test authentifie
 * du describe `parcours authentifies` rappelle `ouvrirSession('thomas')` dans
 * son `beforeEach`. Un `insert` nu viole `user_email_unique` des le deuxieme
 * appel (constat empirique). On veut UNE session neuve a chaque fois, mais LE
 * MEME utilisateur : l'upsert cree la ligne au premier appel et renvoie
 * l'id existant aux appels suivants, sans jamais dupliquer l'adresse.
 */
export async function ouvrirSession(personne: Personne): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET est requis pour les tests E2E.')

  const [{ id: userId }] = await db
    .insert(utilisateur)
    .values({
      id: randomUUID(),
      name: personne === 'thomas' ? 'Thomas' : 'Liz',
      email: ADRESSES[personne],
      emailVerified: true,
      personne,
    })
    .onConflictDoUpdate({ target: utilisateur.email, set: { personne } })
    .returning({ id: utilisateur.id })

  const token = randomUUID()
  await db.insert(session).values({
    id: randomUUID(),
    token,
    userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  const signature = await makeSignature(token, secret)
  return `${token}.${signature}`
}
