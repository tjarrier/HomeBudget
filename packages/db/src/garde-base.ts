/**
 * Le seed commence par `truncate depense, version_config cascade`. TRUNCATE est un
 * ordre DDL : il ne declenche pas les triggers de ligne, donc l'append-only de
 * `version_config` ne le voit meme pas passer. Pointe `DATABASE_URL` sur Supabase,
 * lance `db:seed` par reflexe, et l'historique est parti — sans la moindre
 * resistance de la base.
 *
 * Le seul rempart jusqu'ici, c'etait que personne n'exportait la variable.
 */
export const CONFIRMATION_DISTANT = 'JE VEUX EFFACER LA BASE DISTANTE'

const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const VARIABLE_CONFIRMATION = 'HOMEBUDGET_CONFIRME_EFFACEMENT'

/** Refuse d'effacer une base qui n'est pas sur cette machine. */
export function assertBaseEffacable(url: string, confirmation: string | undefined): void {
  let hote: string
  try {
    hote = new URL(url).hostname
  } catch {
    // On ne suppose PAS « local » par defaut : une URL qu'on ne comprend pas
    // peut tres bien pointer sur la prod.
    throw new Error(
      `DATABASE_URL illisible : impossible d'en extraire un hote. Rien n'a ete efface.`,
    )
  }

  if (HOTES_LOCAUX.has(hote)) return

  if (confirmation === CONFIRMATION_DISTANT) return

  throw new Error(
    `Refus d'effacer une base distante : « ${hote} ».
Le seed commence par un TRUNCATE, qui passe SOUS le trigger append-only.
Si c'est vraiment ce que tu veux : ${VARIABLE_CONFIRMATION}='${CONFIRMATION_DISTANT}'`,
  )
}
