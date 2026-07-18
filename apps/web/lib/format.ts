import { type Cents, formaterEuros } from '@homebudget/domain'

/** Espaces insecables produits par Intl, remplaces par des espaces ordinaires. */
export function formaterMontant(c: Cents): string {
  return formaterEuros(c).replace(/[\xa0\u202F]/g, ' ')
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
