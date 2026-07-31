/**
 * Les variables nommees sont celles que ce module lit — le contrat, documente.
 * Volontairement pas `NodeJS.ProcessEnv` : Next.js l'augmente avec un `NODE_ENV`
 * requis, ce qui rend inassignable tout environnement partiel, et donc
 * intestable chaque cas isolement.
 *
 * La signature d'index n'est pas du laxisme : sans elle le type n'a que des
 * proprietes optionnelles, TypeScript le traite en *weak type* et refuse
 * `process.env` faute de propriete en commun (TS2559).
 */
type EnvironnementVercel = {
  BETTER_AUTH_URL?: string
  VERCEL_ENV?: string
  VERCEL_URL?: string
  [autre: string]: string | undefined
}

/**
 * L'origine que Better Auth annonce a Google. Elle est **posee par
 * l'environnement**, jamais devinee : Google n'accepte aucun wildcard dans ses
 * redirect URIs, donc seule une URL stable et pre-enregistree fonctionne.
 *
 * Sur Vercel, l'absence de la variable est une erreur et non un cas a rattraper.
 * Le repli `localhost` est precisement le piege : cette URI **est** enregistree
 * chez Google (c'est le dev local), donc le tour OAuth reussirait et renverrait
 * l'utilisateur sur son propre poste — sans aucune erreur pour le signaler.
 */
export function origineAuth(env: EnvironnementVercel = process.env): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL
  if (env.VERCEL_ENV) {
    throw new Error(
      'BETTER_AUTH_URL est requise sur Vercel, pour Production comme pour Preview. ' +
        "Posez-y l'URL de branche stable, la meme que le redirect URI enregistre chez Google.",
    )
  }
  return 'http://localhost:3000'
}

/**
 * Les origines depuis lesquelles une requete vers /api/auth/* n'est pas traitee
 * comme un CSRF. L'URL unique du deploiement en fait partie parce que c'est
 * celle que propose le dashboard Vercel : sans elle, la preview ouverte depuis
 * le dashboard est consultable mais la connexion y echoue en mismatch
 * d'origine. Le tour OAuth, lui, repose l'utilisateur sur l'URL de branche.
 */
export function originesDeConfiance(env: EnvironnementVercel = process.env): string[] {
  return env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []
}
