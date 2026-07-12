import { describe, expect, it } from 'vitest'
import { type Depense, phraseSynthese, resumer, soldeDepense } from '../src/solde.js'

function depense(p: Partial<Depense>): Depense {
  return {
    id: 'x',
    date: '2025-08-05',
    description: 'test',
    montant: 111058,
    payePar: 'thomas',
    type: 'charge_fixe',
    mode: 'prorata',
    parts: { thomas: 71861, liz: 39197 },
    versionConfigId: 'v1',
    genereAuto: false,
    commentaire: null,
    ...p,
  }
}

describe('soldeDepense', () => {
  it('le payeur est credite de ce qu il a avance au-dela de sa part', () => {
    // Thomas paie 1110,58 EUR, sa part est 718,61 EUR : Liz lui doit 391,97 EUR.
    expect(soldeDepense(depense({}))).toEqual({ thomas: 39197, liz: -39197 })
  })

  it('un transfert de Liz reduit sa dette', () => {
    // LE PIEGE : Liz verse 400 EUR, sa part vaut 0 -> son solde monte de +400.
    const virement = depense({
      montant: 40000,
      payePar: 'liz',
      type: 'transfert',
      mode: 'transfert',
      parts: { thomas: 40000, liz: 0 },
    })
    expect(soldeDepense(virement)).toEqual({ thomas: -40000, liz: 40000 })
  })

  it('les soldes sont toujours opposes', () => {
    const d = depense({ montant: 21527, parts: { thomas: 10764, liz: 10763 } })
    const s = soldeDepense(d)
    expect(s.thomas).toBe(-s.liz)
  })
})

describe('resumer', () => {
  const depenses: Depense[] = [
    depense({ id: '1' }), // Thomas paie 1110,58 ; parts 718,61 / 391,97
    depense({
      id: '2',
      montant: 40000,
      payePar: 'liz',
      type: 'transfert',
      mode: 'transfert',
      parts: { thomas: 40000, liz: 0 },
    }),
  ]

  it('agrege les montants payes et dus', () => {
    const r = resumer(depenses)
    expect(r.payeThomas).toBe(111058)
    expect(r.payeLiz).toBe(40000)
    expect(r.duThomas).toBe(71861 + 40000)
    expect(r.duLiz).toBe(39197 + 0)
  })

  it('separe les depenses reelles des transferts', () => {
    const r = resumer(depenses)
    expect(r.totalDepenses).toBe(111058) // le virement n est pas une depense
    expect(r.totalTransferts).toBe(40000)
  })

  it('calcule des soldes opposes', () => {
    const r = resumer(depenses)
    expect(r.soldeThomas).toBe(111058 - (71861 + 40000)) // -799
    expect(r.soldeLiz).toBe(-r.soldeThomas)
  })

  it('gere une liste vide', () => {
    const r = resumer([])
    expect(r.soldeThomas).toBe(0)
    expect(r.totalDepenses).toBe(0)
  })
})

describe('phraseSynthese', () => {
  it('dit qui doit quoi quand Thomas est crediteur', () => {
    const r = resumer([depense({})])
    expect(phraseSynthese(r).replace(/\xa0/g, ' ')).toBe('Liz doit 391,97 € à Thomas')
  })

  it('dit qui doit quoi quand Liz est crediteure', () => {
    const r = resumer([
      depense({ montant: 40000, payePar: 'liz', mode: 'transfert', type: 'transfert', parts: { thomas: 40000, liz: 0 } }),
    ])
    expect(phraseSynthese(r).replace(/\xa0/g, ' ')).toBe('Thomas doit 400,00 € à Liz')
  })

  it('annonce l equilibre quand le solde est nul', () => {
    expect(phraseSynthese(resumer([]))).toBe('Vous êtes à jour')
  })
})
