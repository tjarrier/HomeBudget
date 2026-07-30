import { assertDateIsoValide } from './config-version.js'

/**
 * Combien de temps dans l'avenir une depense reste plausible.
 *
 * Au-dela, c'est une coquille de saisie — le Sheet d'origine portait une ligne
 * datee 2029-09-29 pour 2025-09-29. La frontiere est binaire, volontairement :
 * une depense datee dans l'annee a venir est legitime (un prelevement annonce,
 * une regularisation), au-dela il n'existe pas de cas d'usage.
 *
 * Le message de `verifierDatePlausible` ecrit « un an » en toutes lettres,
 * volontairement non interpole depuis cette constante (le francais lirait
 * moins bien et imposerait une regle de pluriel inutile pour une valeur qui ne
 * bouge jamais). Si tu changes `HORIZON_ANNEES`, reecris ce message a la main.
 */
const HORIZON_ANNEES = 1

/**
 * Le dernier jour acceptable pour une depense : un an apres `aujourdhui`,
 * borne INCLUSE.
 *
 * `Date` est utilise en UTC uniquement, jamais expose : un objet Date porte un
 * fuseau, et un decalage d'un jour ici deplacerait la borne (meme prudence que
 * `veilleDe`).
 *
 * Le 29 fevrier est le piege : `Date.UTC(2029, 1, 29)` deborde silencieusement
 * sur le 1er mars, parce que 2029 n'est pas bissextile. On detecte le
 * debordement au changement de mois et on rabat sur le dernier jour du mois
 * voulu, plutot que d'offrir un jour d'horizon supplementaire par accident.
 */
export function dateMaxDepense(aujourdhui: string): string {
  assertDateIsoValide(aujourdhui)
  const [a, m, j] = aujourdhui.split('-').map(Number) as [number, number, number]
  const max = new Date(Date.UTC(a + HORIZON_ANNEES, m - 1, j))
  if (max.getUTCMonth() !== m - 1) {
    // `setUTCDate(0)` recule au dernier jour du mois precedent — donc au dernier
    // jour du mois qu'on visait.
    max.setUTCDate(0)
  }
  return max.toISOString().slice(0, 10)
}

/**
 * Refuse une date de depense trop lointaine.
 *
 * N'a AUCUNE opinion sur la borne basse : elle est tenue par
 * `versionEnVigueurLe`, qui ne trouve aucune version couvrant une date
 * anterieure a la premiere et le dit deja avec ses mots.
 *
 * Pourquoi un refus et non un avertissement contournable : les parts d'une
 * depense sont figees POUR TOUJOURS a sa creation (regle 4 de CLAUDE.md), et
 * rien ne permet aujourd'hui de reparer une depense passee (issue #40). Un
 * avertissement qu'on franchit d'un clic serait donc un moyen d'ecrire une
 * ligne fausse et irreparable.
 */
export function verifierDatePlausible(date: string, aujourdhui: string): void {
  assertDateIsoValide(date)
  const max = dateMaxDepense(aujourdhui)
  // Comparaison lexicographique : elle est exacte sur des chaines YYYY-MM-DD
  // zero-paddees, et c'est deja ainsi que `versionEnVigueurLe` compare ses bornes.
  if (date > max) {
    throw new Error(
      `Date trop lointaine : le ${date} dépasse le ${max} (un an après aujourd’hui). Vérifiez l’année — les parts d’une dépense sont figées définitivement à sa création.`,
    )
  }
}
