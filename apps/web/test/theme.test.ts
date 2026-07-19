import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

  /**
   * UNE famille, pas deux. Le design system importe (`HomeBudget.dc.html`) ne
   * porte pas de serif : la hierarchie vient du poids, de la taille et du
   * contraste de surface. Ce test verrouille l'absence de seconde famille — un
   * `--font-heading` qui reapparaitrait ferait diverger l'app de sa maquette.
   */
  it('ne charge qu une seule famille de caracteres', () => {
    expect(GLOBALS).toMatch(/--font-sans:\s*var\(--font-inter\)/)
    expect(GLOBALS).not.toMatch(/--font-heading/)
  })
})

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const DOSSIERS = ['app', 'components']

function fichiersTsx(dossier: string): string[] {
  const trouves: string[] = []
  const parcourir = (d: string) => {
    for (const entree of readdirSync(d)) {
      const complet = join(d, entree)
      if (statSync(complet).isDirectory()) parcourir(complet)
      else if (/\.tsx?$/.test(entree)) trouves.push(complet)
    }
  }
  try {
    parcourir(join(RACINE, dossier))
  } catch {
    // Dossier absent : rien a verifier.
  }
  return trouves
}

/**
 * Une classe de palette Tailwind ecrite en dur court-circuite le theme : le
 * critere de fin de l'issue A2 — « changer un token se repercute partout » —
 * serait faux. Les couleurs passent par les tokens (`bg-background`,
 * `text-muted-foreground`, `border-border`, `text-destructive`), sans
 * exception.
 */
const PALETTE_EN_DUR =
  /\b(?:bg|text|border|ring|divide|placeholder|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/

describe('aucune couleur ne court-circuite les tokens', () => {
  it('n utilise aucune classe de palette Tailwind en dur', () => {
    const fautifs: string[] = []
    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTsx(dossier)) {
        if (PALETTE_EN_DUR.test(readFileSync(fichier, 'utf-8'))) {
          fautifs.push(fichier.replace(RACINE, ''))
        }
      }
    }
    expect(fautifs).toEqual([])
  })

  it('n utilise ni bg-white ni text-white en dur', () => {
    const fautifs: string[] = []
    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTsx(dossier)) {
        if (/\b(?:bg|text|border)-white\b/.test(readFileSync(fichier, 'utf-8'))) {
          fautifs.push(fichier.replace(RACINE, ''))
        }
      }
    }
    expect(fautifs).toEqual([])
  })
})
