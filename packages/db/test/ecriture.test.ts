import { type VersionConfig, dateMaxDepense } from '@homebudget/domain'
import { describe, expect, it } from 'vitest'
import { calculerPartsPourSaisie } from '../src/ecriture.js'

/**
 * `calculerPartsPourSaisie` est pure : `aujourdhui` est un parametre, jamais
 * l'horloge du process. Ce test s'en sert reellement, avec une date FIGEE, et
 * verifie les deux cotes exacts de la frontiere haute (issue #29) — pas une
 * date arbitrairement lointaine, qui ne prouverait rien sur le cablage exact
 * de la borne. Sans ce test, `aujourdhui` etait un parametre expose sur
 * l'unique chemin d'ecriture (atteignable depuis une Server Action) que rien
 * n'exercait jamais.
 */
describe('calculerPartsPourSaisie — frontiere haute avec horloge figee', () => {
  const AUJOURDHUI = '2026-07-30'

  const version: VersionConfig = {
    id: 'v1',
    libelle: 'v1',
    dateDebut: '2025-01-01',
    dateFin: null,
    salaireNetThomas: 300000,
    salaireNetLiz: 100000,
    chargesCommunes: [],
    chargesPersoThomas: [],
    chargesPersoLiz: [],
  }

  function saisie(date: string) {
    return {
      date,
      description: 'Test frontiere',
      montant: 10000,
      payePar: 'thomas' as const,
      type: 'courante' as const,
      mode: 'moitie' as const,
    }
  }

  it('accepte la date max exacte, un an apres aujourdhui', () => {
    const max = dateMaxDepense(AUJOURDHUI)
    const resultat = calculerPartsPourSaisie(saisie(max), [version], AUJOURDHUI)
    expect(resultat.parts.thomas + resultat.parts.liz).toBe(10000)
  })

  it('refuse max + 1 jour', () => {
    // `max` est '2027-07-30' pour AUJOURDHUI = '2026-07-30' : pas de piege de
    // bissextile ici, un simple +1 jour lexicographique suffit.
    const max = dateMaxDepense(AUJOURDHUI)
    const [a, m, j] = max.split('-').map(Number) as [number, number, number]
    const lendemain = new Date(Date.UTC(a, m - 1, j + 1)).toISOString().slice(0, 10)
    expect(() => calculerPartsPourSaisie(saisie(lendemain), [version], AUJOURDHUI)).toThrow(
      /trop lointaine/i,
    )
  })
})
