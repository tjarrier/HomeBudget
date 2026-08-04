import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parserEurosSaisis } from '@homebudget/domain'
import { describe, expect, it } from 'vitest'
import {
  aujourdhuiLocal,
  formaterDate,
  formaterMontant,
  formaterMontantSigne,
} from '../lib/format.js'

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

describe("l'aide de saisie du formulaire de version ne ment pas", () => {
  // Le parseur refuse le point comme separateur de milliers (« 3.300,00 »), et
  // un salaire depasse toujours 999 € : c'est le seul champ ou l'utilisateur
  // rencontre le probleme des sa premiere saisie. On affiche donc un exemple —
  // et ce test verifie que l'exemple affiche est REELLEMENT accepte. Une aide
  // fausse serait pire que pas d'aide.
  const source = readFileSync(
    fileURLToPath(new URL('../app/(app)/config/formulaire-version.tsx', import.meta.url)),
    'utf-8',
  )
  // Seuls les champs MONETAIRES sont concernes : `inputMode="decimal"` est
  // exactement ce qui les distingue. Ratisser tous les placeholders du fichier
  // ferait echouer ce test des qu'un champ texte en recoit un (« Révision loyer
  // 2027 » sur le libelle), ce qui ne dit rien du format des montants.
  const exemples = source
    .split('<Input')
    .slice(1)
    .map((element) => element.split('/>')[0] ?? '')
    .filter((element) => element.includes('inputMode="decimal"'))
    .flatMap((element) => [...element.matchAll(/placeholder="([^"]+)"/g)].map(([, v]) => v))

  it('propose au moins un exemple de format', () => {
    expect(exemples.length).toBeGreaterThan(0)
  })

  it.each(exemples)('« %s » est accepte par parserEurosSaisis', (exemple) => {
    expect(() => parserEurosSaisis(exemple as string)).not.toThrow()
  })
})

describe('formaterMontantSigne', () => {
  it('affiche un montant positif sans signe par defaut', () => {
    expect(formaterMontantSigne(114580, false)).toBe('1 145,80 €')
  })

  it('affiche un plus devant un positif quand on le demande', () => {
    expect(formaterMontantSigne(114580, true)).toBe('+1 145,80 €')
  })

  it('affiche TOUJOURS le moins sur un negatif, meme sans le demander', () => {
    // Un negatif rendu comme un positif serait un mensonge affiche. Le drapeau
    // ne commande QUE le plus explicite ; le moins n'est jamais masquable.
    expect(formaterMontantSigne(-114580, false)).toBe('−1 145,80 €')
    expect(formaterMontantSigne(-114580, true)).toBe('−1 145,80 €')
  })

  it('utilise le vrai moins typographique, pas un trait d union', () => {
    // U+2212. Il a la meme chasse que le plus en chiffres tabulaires : une
    // colonne de soldes signes reste alignee au caractere pres.
    expect(formaterMontantSigne(-100, true)).toContain('−')
    expect(formaterMontantSigne(-100, true)).not.toContain('-')
  })

  it('n affiche aucun signe a zero', () => {
    expect(formaterMontantSigne(0, true)).toBe('0,00 €')
  })
})

describe('aujourdhuiLocal', () => {
  it('rend une date ISO zero-paddee', () => {
    expect(aujourdhuiLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("lit l'horloge LOCALE, jamais UTC", () => {
    // Le piege : `toISOString()` daterait en UTC. Saisi a 23 h a Paris, le champ
    // proposerait demain — et le 1er du mois a 1 h, le selecteur de mois
    // proposerait le mois precedent. On recompose donc la date attendue depuis
    // les accesseurs LOCAUX, sans jamais passer par toISOString().
    const n = new Date()
    const attendu = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    expect(aujourdhuiLocal()).toBe(attendu)
  })
})
