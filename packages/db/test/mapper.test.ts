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
      chargesPersoThomas: [{ libelle: 'Sport', montant: 3000 }],
      chargesPersoLiz: [{ libelle: 'Yoga', montant: 2000 }],
      createdAt: new Date(0),
    })

    expect(version.salaireNetThomas).toBe(330000)
    expect(version.salaireNetLiz).toBe(180000)
    // Drizzle rend les colonnes `date` en chaines : ne jamais les convertir en Date,
    // un objet Date porte un fuseau et decale les bornes de version d'un jour.
    expect(version.dateDebut).toBe('2025-07-01')
    expect(version.dateFin).toBe('2026-06-30')
    expect(version.chargesCommunes).toEqual([{ libelle: 'Loyer', montant: 78500 }])

    // Les 9 champs du domaine, un par un : chargesPersoThomas et chargesPersoLiz
    // sont toutes deux des Charge[], et une fixture vide des deux cotes rendrait
    // un swap entre elles indetectable. Ici elles portent des valeurs distinctes,
    // donc un swap dans le mapper ferait echouer cette assertion.
    expect(version).toEqual({
      id: 'v1',
      libelle: 'Config 2025-2026',
      dateDebut: '2025-07-01',
      dateFin: '2026-06-30',
      salaireNetThomas: 330000,
      salaireNetLiz: 180000,
      chargesCommunes: [{ libelle: 'Loyer', montant: 78500 }],
      chargesPersoThomas: [{ libelle: 'Sport', montant: 3000 }],
      chargesPersoLiz: [{ libelle: 'Yoga', montant: 2000 }],
    })
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

    // Les 11 champs du domaine, un par un.
    expect(d).toEqual({
      id: 'd1',
      date: '2026-07-05',
      description: 'Loyer',
      montant: 79100,
      payePar: 'thomas',
      type: 'charge_fixe',
      mode: 'prorata',
      parts: { thomas: 51150, liz: 27950 },
      versionConfigId: 'v2',
      genereAuto: false,
      commentaire: null,
    })
  })

  it('distingue chaque champ meme quand ils sont du meme type', () => {
    // Fixture ou id, description, versionConfigId et commentaire sont des chaines
    // distinctes les unes des autres, et genereAuto est a `true` : un swap entre
    // deux champs de meme type ferait echouer cette assertion.
    const d = depenseDepuisLigne({
      id: 'd-id-3',
      date: '2026-07-06',
      description: 'Courses',
      montantCents: 4200,
      payePar: 'liz',
      type: 'courante',
      modeRepartition: 'moitie',
      partThomasCents: 2100,
      partLizCents: 2100,
      versionConfigId: 'v-config-3',
      genereAuto: true,
      commentaire: 'une note',
      createdAt: new Date(0),
    })

    expect(d).toEqual({
      id: 'd-id-3',
      date: '2026-07-06',
      description: 'Courses',
      montant: 4200,
      payePar: 'liz',
      type: 'courante',
      mode: 'moitie',
      parts: { thomas: 2100, liz: 2100 },
      versionConfigId: 'v-config-3',
      genereAuto: true,
      commentaire: 'une note',
    })
  })
})
