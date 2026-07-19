import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const GLOBALS = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf-8')

/**
 * Les valeurs livrees par shadcn (baseColor: neutral). Le critere de fin de
 * l'issue A2 est « plus aucune valeur du theme par defaut ne subsiste » : ce
 * test l'exprime litteralement plutot que d'interdire la chroma 0, qui est la
 * valeur legitime du blanc pur `oklch(1 0 0)`.
 */
const VALEURS_PAR_DEFAUT = [
  'oklch(0.145 0 0)',
  'oklch(0.205 0 0)',
  'oklch(0.269 0 0)',
  'oklch(0.371 0 0)',
  'oklch(0.439 0 0)',
  'oklch(0.556 0 0)',
  'oklch(0.577 0.245 27.325)',
  'oklch(0.708 0 0)',
  'oklch(0.87 0 0)',
  'oklch(0.922 0 0)',
  'oklch(0.97 0 0)',
  'oklch(0.985 0 0)',
]

describe('globals.css ne garde rien du theme shadcn par defaut', () => {
  it('ne declare plus de bloc .dark', () => {
    expect(GLOBALS).not.toMatch(/^\.dark\s*\{/m)
  })

  it('ne declare plus les tokens sans usage', () => {
    expect(GLOBALS).not.toMatch(/--chart-\d/)
    expect(GLOBALS).not.toMatch(/--sidebar/)
  })

  it('ne conserve aucune valeur du theme livre', () => {
    const restantes = VALEURS_PAR_DEFAUT.filter((v) => GLOBALS.includes(v))
    expect(restantes).toEqual([])
  })

  it('charge les deux familles de la direction visuelle', () => {
    expect(GLOBALS).toMatch(/--font-sans:\s*var\(--font-inter\)/)
    expect(GLOBALS).toMatch(/--font-heading:\s*var\(--font-instrument-serif\)/)
  })
})
