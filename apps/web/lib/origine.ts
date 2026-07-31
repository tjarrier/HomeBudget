/**
 * Les seules variables que ce module lit. Volontairement pas `NodeJS.ProcessEnv` :
 * Next.js l'augmente avec un `NODE_ENV` requis, ce qui rend inassignable tout
 * environnement partiel — et donc intestable chaque cas isolement.
 */
type EnvironnementVercel = {
  BETTER_AUTH_URL?: string
  VERCEL_ENV?: string
  VERCEL_URL?: string
  VERCEL_BRANCH_URL?: string
  VERCEL_PROJECT_PRODUCTION_URL?: string
}

const https = (hote: string) => `https://${hote}`

/**
 * L'origine que Better Auth annonce a Google pour construire son redirect URI.
 *
 * Google n'accepte AUCUN wildcard dans ses "Authorized redirect URIs" : chaque
 * origine doit y etre pre-enregistree a la main. Or l'URL d'un deploiement
 * Vercel (`VERCEL_URL`) est unique par deploiement. La suivre donnerait un
 * `redirect_uri_mismatch` a chaque push. On prend donc `VERCEL_BRANCH_URL`,
 * stable par branche : une seule ligne a enregistrer par branche de preview.
 *
 * `VERCEL_ENV` est teste avant tout le reste parce que
 * `VERCEL_PROJECT_PRODUCTION_URL` est pose sur TOUS les deploiements, preview
 * comprise — et qu'une preview qui annonce le domaine de prod y poserait son
 * cookie de session.
 */
export function origineAuth(env: EnvironnementVercel = process.env): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return https(env.VERCEL_PROJECT_PRODUCTION_URL)
  }
  if (env.VERCEL_BRANCH_URL) return https(env.VERCEL_BRANCH_URL)
  return 'http://localhost:3000'
}

/**
 * Les origines depuis lesquelles une requete vers /api/auth/* n'est pas traitee
 * comme un CSRF. L'URL unique du deploiement en fait partie : sans elle, la
 * preview est consultable mais la connexion y echoue en mismatch d'origine.
 * Le tour OAuth, lui, repose l'utilisateur sur l'URL de branche.
 */
export function originesDeConfiance(env: EnvironnementVercel = process.env): string[] {
  return [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((hote): hote is string => Boolean(hote))
    .map(https)
}
