import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formaterEuros, phraseSynthese, resumer, verifierContinuite } from '@homebudget/domain'
import { describe, expect, it } from 'vitest'
import { VERSIONS_INITIALES, importerDepenses } from '../src/import-sheet.js'

const CSV = readFileSync(
  fileURLToPath(
    new URL('../../../docs/data/sheet-export-2026-07-12/depenses.csv', import.meta.url),
  ),
  'utf-8',
)

describe('versions initiales', () => {
  it('forme une suite continue et sans chevauchement', () => {
    expect(() => verifierContinuite(VERSIONS_INITIALES)).not.toThrow()
  })

  it('v1 se cloture la veille de v2', () => {
    expect(VERSIONS_INITIALES[0]?.dateFin).toBe('2026-06-30')
    expect(VERSIONS_INITIALES[1]?.dateDebut).toBe('2026-07-01')
    expect(VERSIONS_INITIALES[1]?.dateFin).toBeNull()
  })
})

describe('cross-check des parts du Sheet', () => {
  const ENTETE =
    'Date,Description,Montant,Payé par,Type,Part Thomas,Part Liz,Solde Thomas,Solde Liz,Commentaire'

  it('refuse une ligne dont les parts du Sheet ne somment pas au montant', () => {
    // 60 + 30 = 90, pas 100. Le Sheet se contredit : on ne devine pas laquelle
    // des trois colonnes est fausse, on refuse d'importer.
    const csv = `${ENTETE}\n2025-08-05,Courses,100,Thomas,Courante,60,30,0,0,`

    expect(() => importerDepenses(csv, VERSIONS_INITIALES)).toThrow(/ne somment pas/i)
  })

  it('accepte une ligne dont les parts du Sheet somment au montant', () => {
    const csv = `${ENTETE}\n2025-08-05,Courses,100,Thomas,Courante,60,40,0,0,`

    expect(() => importerDepenses(csv, VERSIONS_INITIALES)).not.toThrow()
  })

  // `payePar === 'Thomas' ? 'thomas' : 'liz'` faisait retomber TOUT le reste sur Liz :
  // une coquille, un accent, une colonne decalee, et le payeur bascule en silence.
  // Or le payeur porte le SIGNE du solde : se tromper de payeur inverse la dette.
  it('refuse un payeur que le Sheet ne connait pas, plutot que de le compter comme Liz', () => {
    const csv = `${ENTETE}\n2025-08-05,Courses,100,Thoams,Courante,60,40,0,0,`

    expect(() => importerDepenses(csv, VERSIONS_INITIALES)).toThrow(/payeur/i)
  })

  it('refuse une colonne payeur vide', () => {
    const csv = `${ENTETE}\n2025-08-05,Courses,100,,Courante,60,40,0,0,`

    expect(() => importerDepenses(csv, VERSIONS_INITIALES)).toThrow(/incomplete|payeur/i)
  })
})

describe('import du Sheet', () => {
  const depenses = importerDepenses(CSV, VERSIONS_INITIALES)

  it('importe les 33 lignes', () => {
    expect(depenses).toHaveLength(33)
  })

  it('corrige la date aberrante 2029-09-29 en 2025-09-29', () => {
    expect(depenses.some((d) => d.date.startsWith('2029'))).toBe(false)
    const rembours = depenses.find(
      (d) => d.description === 'Remboursement Tricount' && d.montant === 49214,
    )
    expect(rembours?.date).toBe('2025-09-29')
  })

  it('reclasse les virements et remboursements en transferts', () => {
    const transferts = depenses.filter((d) => d.type === 'transfert')
    expect(transferts).toHaveLength(15)
    for (const t of transferts) {
      expect(t.mode).toBe('transfert')
      // La part du payeur vaut 0 : le signe ne doit jamais s'inverser.
      const partPayeur = t.payePar === 'thomas' ? t.parts.thomas : t.parts.liz
      expect(partPayeur).toBe(0)
    }
  })

  it('laisse les Billets Colombie en courante 50/50', () => {
    const colombie = depenses.find((d) => d.description === 'Billets Colombie')
    expect(colombie?.type).toBe('courante')
    expect(colombie?.mode).toBe('moitie')
    expect(colombie?.parts).toEqual({ thomas: 107637, liz: 107637 })
  })

  it('importe la ligne de juillet 2026 telle quelle, a 1 110,58 EUR', () => {
    // Le Sheet n'avait pas repercute la revision de loyer. On importe la realite,
    // pas l'intention : c'est ce qui a ete paye.
    const juillet = depenses.find((d) => d.date === '2026-07-05' && d.type === 'charge_fixe')
    expect(juillet?.montant).toBe(111058)
    expect(juillet?.parts).toEqual({ thomas: 71861, liz: 39197 })
  })

  it('rattache chaque depense a la version en vigueur a sa date', () => {
    const avant = depenses.find((d) => d.date === '2026-06-05' && d.type === 'charge_fixe')
    const apres = depenses.find((d) => d.date === '2026-07-05' && d.type === 'charge_fixe')
    expect(avant?.versionConfigId).toBe('v1')
    expect(apres?.versionConfigId).toBe('v2')
  })

  it('respecte l invariant sur chaque ligne : parts sommees au montant', () => {
    for (const d of depenses) {
      expect(d.parts.thomas + d.parts.liz).toBe(d.montant)
    }
  })
})

describe('LE CANARI — non-regression du solde', () => {
  it('Liz doit exactement 1 145,80 EUR a Thomas', () => {
    const r = resumer(importerDepenses(CSV, VERSIONS_INITIALES))

    // 114 580 centimes. Pas 114 579, pas 114 581.
    //
    // Le Sheet affichait 1 145,79 EUR, arrondi de 1 145,788425 EUR : il traînait
    // des fractions de centime que personne ne pouvait payer. L'arithmetique en
    // centimes les supprime. L'ecart d'un centime est la CORRECTION, pas le bug.
    //
    // Si ce test tombe, ne l'ajuste pas : un des quatre invariants a ete viole
    // (recalcul retroactif, signe de transfert inverse, double arrondi, flottant).
    expect(r.soldeThomas).toBe(114580)
    expect(r.soldeLiz).toBe(-114580)
    expect(formaterEuros(r.soldeThomas).replace(/[\xa0\u202f]/g, ' ')).toBe('1 145,80 €')
    expect(phraseSynthese(r).replace(/[\xa0\u202f]/g, ' ')).toBe('Liz doit 1 145,80 € à Thomas')
  })
})
