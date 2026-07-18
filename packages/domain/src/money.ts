/**
 * L'argent est un entier de centimes. Jamais un flottant.
 * `1 110,58 €` s'ecrit `111058`.
 */
export type Cents = number

const FORMATEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function eurosVersCents(euros: number): Cents {
  if (!Number.isFinite(euros)) {
    throw new Error(`Montant invalide : ${euros}`)
  }
  return Math.round(euros * 100)
}

/**
 * Saisie humaine ("1 110,58", "1110.58", "400,00 €") -> centimes entiers.
 * Vit dans le domaine, pas dans l'UI : c'est la derniere barriere avant qu'un
 * flottant n'entre dans le systeme.
 */
export function parserEurosSaisis(saisie: string): Cents {
  const nettoye = saisie.replace(/[\s\xa0\u202F€]/g, '').replace(',', '.')
  if (nettoye === '' || !/^-?\d+(\.\d+)?$/.test(nettoye)) {
    throw new Error(`Montant invalide : ${saisie}`)
  }
  const [, decimales] = nettoye.split('.')
  if (decimales !== undefined && decimales.length > 2) {
    throw new Error(`Un montant s'arrete au centime : ${saisie}`)
  }
  return eurosVersCents(Number(nettoye))
}

export function centsVersEuros(c: Cents): number {
  assertEntier(c)
  return c / 100
}

export function formaterEuros(c: Cents): string {
  assertEntier(c)
  return FORMATEUR.format(c / 100)
}

/**
 * Repartit un montant entre deux parts selon un ratio, en garantissant
 * `premier + second === montant` **par construction**.
 *
 * Un seul arrondi : le second recoit le reste. C'est ce qui rend l'invariant
 * exact plutot que probable.
 */
export function repartirAuRatio(montant: Cents, ratioPremier: number): [Cents, Cents] {
  assertEntier(montant)
  if (!Number.isFinite(ratioPremier) || ratioPremier < 0 || ratioPremier > 1) {
    throw new Error(`Ratio hors de [0,1] : ${ratioPremier}`)
  }
  const premier = Math.round(montant * ratioPremier)
  return [premier, montant - premier]
}

export function assertEntier(c: Cents): void {
  if (!Number.isInteger(c)) {
    throw new Error(`Montant en centimes attendu (entier), recu : ${c}`)
  }
}
