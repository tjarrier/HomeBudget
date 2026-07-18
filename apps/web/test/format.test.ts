import { describe, expect, it } from 'vitest'
import { formaterDate, formaterMontant } from '../lib/format.js'

describe('formaterMontant', () => {
  it('rend des euros lisibles avec des espaces normaux', () => {
    // Intl produit des espaces insecables (\xa0 ou \u202F) selon la version d'ICU.
    // Les tests Playwright comparent du texte : on normalise ici, une fois pour toutes.
    expect(formaterMontant(114580)).toBe('1 145,80 €')
    expect(formaterMontant(0)).toBe('0,00 €')
    expect(formaterMontant(-40000)).toBe('-400,00 €')
  })
})

describe('formaterDate', () => {
  it('rend une date ISO au format francais sans passer par un objet Date', () => {
    expect(formaterDate('2026-07-05')).toBe('05/07/2026')
  })
})
