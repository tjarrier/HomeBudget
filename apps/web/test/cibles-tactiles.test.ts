import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Issue C1 — le plancher tactile de 44px.
 *
 * La VRAIE verification est `apps/web/e2e/cibles-tactiles.spec.ts` : elle
 * mesure les boites rendues a 360px, donc elle couvre aussi les controles
 * qu'on ecrira demain. Mais elle demande Docker, un build et un navigateur.
 * Celle-ci ne verrouille qu'une chose, en une milliseconde et sans dependance :
 * les quatre primitives par lesquelles passent TOUS les controles de l'app
 * gardent leur plancher. C'est la regression la plus probable — quelqu'un qui
 * trouve le champ trop haut et repasse `h-11` a `h-10` — et c'est celle que
 * `task verif` doit attraper avant la CI.
 */
const PLANCHER = /\b(?:min-)?h-11\b/

// Ce que Tailwind rend sous 44px : 32, 36 et 40px. Une primitive de controle
// qui en porterait une repasserait sous le seuil sans que rien ne le dise.
const TROP_BAS = /\b(?:min-)?h-(?:8|9|10)\b/

const PRIMITIVES = ['button', 'input', 'select', 'textarea'] as const

/**
 * Le source, prive de ses commentaires — seul le code applique une classe.
 *
 * Sans ce depouillage le test ment dans les deux sens, et il ment deja : le
 * docstring de `textarea.tsx` cite `min-h-11`, donc supprimer la classe du
 * composant laisserait le test vert. Symetriquement, une note qui raconterait
 * le passage de `h-10` a `h-11` le ferait echouer sans qu'aucune classe ait
 * bouge. Ces docstrings racontent l'historique du fichier : ils citeront des
 * hauteurs.
 */
function source(nom: string): string {
  const brut = readFileSync(
    fileURLToPath(new URL(`../components/ui/${nom}.tsx`, import.meta.url)),
    'utf-8',
  )
  return (
    brut
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // `[^:]` laisse passer le `//` d'une URL dans une chaine.
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  )
}

describe('les primitives de controle tiennent le plancher tactile de 44px', () => {
  for (const nom of PRIMITIVES) {
    it(`${nom} porte h-11 ou min-h-11`, () => {
      expect(source(nom)).toMatch(PLANCHER)
    })

    it(`${nom} ne porte aucune hauteur sous 44px`, () => {
      expect(source(nom)).not.toMatch(TROP_BAS)
    })
  }
})
