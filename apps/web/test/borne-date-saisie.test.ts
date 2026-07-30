import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Issue #29 — la borne haute des dates de depense.
 *
 * La VRAIE garde est serveur (`verifierDatePlausible`, appelee par
 * `calculerPartsPourSaisie`), et elle est testee dans le domaine et en
 * integration. Ce test-ci verrouille autre chose : que l'utilisateur ne puisse
 * pas CHOISIR la date aberrante dans le selecteur natif. Un refus qui n'arrive
 * qu'apres coup laisse remplir tout le formulaire pour rien.
 *
 * Il verifie aussi que la borne vient de la MEME fonction du domaine que le
 * serveur : une constante recopiee dans le composant divergerait un jour.
 */
function source(): string {
  const brut = readFileSync(
    fileURLToPath(new URL('../app/(app)/depenses/formulaire-depense.tsx', import.meta.url)),
    'utf-8',
  )
  // Sans depouiller les commentaires, une note qui citerait `dateMaxDepense`
  // suffirait a rendre le test vert alors que le composant ne l'appelle pas.
  return brut
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('le champ date du formulaire de depense porte la borne haute', () => {
  it('importe dateMaxDepense du domaine', () => {
    expect(source()).toMatch(/dateMaxDepense/)
  })

  it('pose un attribut max sur l input de type date', () => {
    const src = source()
    // La balise <Input ... type="date" ... /> en entier, attributs sur
    // plusieurs lignes compris. `[\s\S]*?` et non `[^>]*` : un handler
    // `onChange={(e) => ...}` contient un `>` qui couperait la classe negative
    // au milieu de la balise. Le `*?` non gourmand s'arrete au premier `/>`,
    // donc a la fermeture de cette balise-ci.
    const champ = src.match(/<Input[\s\S]*?type="date"[\s\S]*?\/>/)
    expect(champ, 'aucun <Input type="date" /> trouve dans le formulaire').not.toBeNull()
    expect(champ?.[0]).toMatch(/max=\{dateMaxDepense\(/)
  })
})
