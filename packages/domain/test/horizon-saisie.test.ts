import { describe, expect, it } from 'vitest'
import { dateMaxDepense, verifierDatePlausible } from '../src/horizon-saisie.js'

describe('dateMaxDepense', () => {
  it('rend le meme jour de calendrier, un an plus tard', () => {
    expect(dateMaxDepense('2026-07-30')).toBe('2027-07-30')
  })

  it('rabat le 29 fevrier sur le 28, sans deborder sur mars', () => {
    // 2028 est bissextile, 2029 ne l'est pas. L'arithmetique naive de JS rend
    // 2029-03-01 : un jour d'horizon gagne en silence, exactement le genre de
    // decalage d'un jour contre lequel `veilleDe` se premunit deja.
    expect(dateMaxDepense('2028-02-29')).toBe('2029-02-28')
  })

  it('traverse une fin de mois sans deriver', () => {
    expect(dateMaxDepense('2026-12-31')).toBe('2027-12-31')
    expect(dateMaxDepense('2026-01-01')).toBe('2027-01-01')
  })

  it('refuse une date ISO non zero-paddee plutot que de la deviner', () => {
    expect(() => dateMaxDepense('2026-7-1')).toThrow(/invalide/i)
  })
})

describe('verifierDatePlausible', () => {
  const AUJOURDHUI = '2026-07-30'

  it('accepte la limite exacte', () => {
    // La borne est INCLUSIVE : le dernier jour acceptable passe.
    expect(() => verifierDatePlausible('2027-07-30', AUJOURDHUI)).not.toThrow()
  })

  it('refuse le lendemain de la limite', () => {
    expect(() => verifierDatePlausible('2027-07-31', AUJOURDHUI)).toThrow(
      /2027-07-31[\s\S]*2027-07-30/,
    )
  })

  it('accepte aujourd hui', () => {
    expect(() => verifierDatePlausible(AUJOURDHUI, AUJOURDHUI)).not.toThrow()
  })

  it("refuse la date aberrante du Sheet d'origine", () => {
    // La ligne 5 de l'export portait 2029-09-29 pour 2025-09-29. C'est le cas
    // reel qui a motive l'issue #29.
    expect(() => verifierDatePlausible('2029-09-29', AUJOURDHUI)).toThrow(/trop lointaine/i)
  })

  it('dit POURQUOI la date est refusee, pas seulement qu elle l est', () => {
    // Les parts sont figees pour toujours a la creation et rien ne permet de
    // reparer une depense passee : le message doit porter cette information,
    // sinon l'utilisateur croit a une lubie de l'application.
    expect(() => verifierDatePlausible('2029-09-29', AUJOURDHUI)).toThrow(/fig/i)
  })

  it("n'a aucune opinion sur le passe, meme lointain", () => {
    // La borne BASSE appartient a `versionEnVigueurLe`, qui la produit deja avec
    // ses mots (« Aucune version de config ne couvre le ... »). Deux messages
    // pour la meme cause diraient la meme chose, moins bien.
    expect(() => verifierDatePlausible('1999-01-01', AUJOURDHUI)).not.toThrow()
  })

  it('refuse une date impossible au calendrier', () => {
    expect(() => verifierDatePlausible('2026-02-30', AUJOURDHUI)).toThrow(/invalide/i)
  })
})
