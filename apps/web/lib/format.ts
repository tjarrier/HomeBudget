import { type Cents, formaterEuros } from '@homebudget/domain'

/** Espaces insecables produits par Intl, remplaces par des espaces ordinaires. */
export function formaterMontant(c: Cents): string {
  return formaterEuros(c).replace(/[\xa0\u202f]/g, ' ')
}

/**
 * Le formatage signe des montants.
 *
 * `avecSignePositif` ne commande QUE le plus explicite : un montant negatif
 * porte toujours son moins. L'inverse permettrait qu'un oubli de drapeau
 * affiche `1 145,80 €` la ou la valeur vaut −114580 — un mensonge a l'ecran.
 *
 * Le signe est pose ICI, a partir du signe de la valeur recue, et jamais
 * derive d'un contexte. Voir CLAUDE.md, « Le piege qui coute de l'argent » :
 * si un ecran affiche un jour le mauvais sens, le bug est dans le domaine.
 */
export function formaterMontantSigne(c: Cents, avecSignePositif: boolean): string {
  const texte = formaterMontant(Math.abs(c))
  if (c < 0) return `−${texte}` // U+2212, pas un trait d'union
  if (avecSignePositif && c > 0) return `+${texte}`
  return texte
}

/**
 * Aujourd'hui, en date ISO, d'apres l'horloge LOCALE du navigateur.
 *
 * `toISOString()` daterait en UTC : saisi a 23 h a Paris, le champ proposerait
 * demain — et le 1er du mois a 1 h, le selecteur de mois proposerait le mois
 * precedent. Un `<input type="date">` comme un `<input type="month">` attendent
 * la date locale de celui qui saisit.
 *
 * Le pendant serveur est `aujourdhuiIso()` (packages/db), qui lit en UTC. Les
 * deux peuvent differer de quelques heures : sans consequence sur une fenetre
 * d'un an, et le serveur reste la seule autorite.
 */
export function aujourdhuiLocal(): string {
  const maintenant = new Date()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')
  return `${maintenant.getFullYear()}-${mois}-${jour}`
}

/**
 * `2026-07-05` -> `05/07/2026`. Decoupage de chaine, jamais `new Date()` :
 * un objet Date porte un fuseau et decalerait la date d'un jour.
 */
export function formaterDate(iso: string): string {
  const [annee, mois, jour] = iso.split('-')
  if (!annee || !mois || !jour) throw new Error(`Date ISO invalide : ${iso}`)
  return `${jour}/${mois}/${annee}`
}
