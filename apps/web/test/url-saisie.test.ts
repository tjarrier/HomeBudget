import { describe, expect, it } from 'vitest'
import { lienFermerSaisie, lienOuvrirSaisie, modeSaisie } from '../lib/url-saisie.js'

describe('modeSaisie', () => {
  it('ne reconnait que les deux valeurs que la feuille sait ouvrir', () => {
    expect(modeSaisie('1')).toBe('libre')
    expect(modeSaisie('regler')).toBe('regler')
    expect(modeSaisie(null)).toBeNull()
    expect(modeSaisie('oui')).toBeNull()
  })
})

describe('lienOuvrirSaisie', () => {
  it('garde les parametres de l ecran courant', () => {
    const params = new URLSearchParams('mois=2026-08&n=40')
    expect(lienOuvrirSaisie('/depenses', params, 'libre')).toBe(
      '/depenses?mois=2026-08&n=40&saisie=1',
    )
  })

  it('ouvre le reglement depuis l accueil', () => {
    expect(lienOuvrirSaisie('/', new URLSearchParams(), 'regler')).toBe('/?saisie=regler')
  })

  it('remplace un mode deja ouvert plutot que d en empiler deux', () => {
    expect(lienOuvrirSaisie('/', new URLSearchParams('saisie=regler'), 'libre')).toBe('/?saisie=1')
  })

  it('ne modifie pas les parametres recus', () => {
    const params = new URLSearchParams('mois=2026-08')
    lienOuvrirSaisie('/depenses', params, 'libre')
    expect(params.toString()).toBe('mois=2026-08')
  })
})

describe('lienFermerSaisie', () => {
  it('retire la feuille et garde le reste', () => {
    expect(lienFermerSaisie('/depenses', new URLSearchParams('mois=2026-08&saisie=1'))).toBe(
      '/depenses?mois=2026-08',
    )
  })

  it('ne laisse pas de « ? » orphelin', () => {
    expect(lienFermerSaisie('/', new URLSearchParams('saisie=regler'))).toBe('/')
  })
})
