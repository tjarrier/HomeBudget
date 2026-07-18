import { describe, expect, it } from 'vitest'
import { depenseDepuisLigne, versionDepuisLigne } from '../src/mapper.js'

describe('versionDepuisLigne', () => {
  it('renomme les colonnes suffixees Cents et laisse les dates en chaines ISO', () => {
    const version = versionDepuisLigne({
      id: 'v1',
      libelle: 'Config 2025-2026',
      dateDebut: '2025-07-01',
      dateFin: '2026-06-30',
      salaireNetThomasCents: 330000,
      salaireNetLizCents: 180000,
      chargesCommunes: [{ libelle: 'Loyer', montant: 78500 }],
      chargesPersoThomas: [],
      chargesPersoLiz: [],
      createdAt: new Date(0),
    })

    expect(version.salaireNetThomas).toBe(330000)
    expect(version.salaireNetLiz).toBe(180000)
    // Drizzle rend les colonnes `date` en chaines : ne jamais les convertir en Date,
    // un objet Date porte un fuseau et decale les bornes de version d'un jour.
    expect(version.dateDebut).toBe('2025-07-01')
    expect(version.dateFin).toBe('2026-06-30')
    expect(version.chargesCommunes).toEqual([{ libelle: 'Loyer', montant: 78500 }])
  })
})

describe('depenseDepuisLigne', () => {
  it('regroupe les deux colonnes de parts en un objet Parts', () => {
    const d = depenseDepuisLigne({
      id: 'd1',
      date: '2026-07-05',
      description: 'Loyer',
      montantCents: 79100,
      payePar: 'thomas',
      type: 'charge_fixe',
      modeRepartition: 'prorata',
      partThomasCents: 51150,
      partLizCents: 27950,
      versionConfigId: 'v2',
      genereAuto: false,
      commentaire: null,
      createdAt: new Date(0),
    })

    expect(d.parts).toEqual({ thomas: 51150, liz: 27950 })
    expect(d.parts.thomas + d.parts.liz).toBe(d.montant)
    expect(d.mode).toBe('prorata')
    expect(d.date).toBe('2026-07-05')
  })
})
