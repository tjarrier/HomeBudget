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
 *
 * Le test isole chaque balise <Input ... /> du fichier avant de chercher
 * `type="date"` et `max=` : sans cette isolation, un `max` mal place sur un
 * champ anterieur (ex. "montant", premiere balise <Input du fichier) serait
 * englobe dans le meme match et rendrait le test vert a tort.
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

  it('pose un attribut max sur l input de type date, et sur lui seul', () => {
    const src = source()
    // Chaque balise <Input ... /> du fichier, isolee. `(?:(?!<Input)[\s\S])*?`
    // et non `[\s\S]*?` : le second franchit une balise <Input> pour atteindre
    // la suivante des lors que `type="date"` apparait plus loin dans le
    // fichier — le champ "montant" (le premier <Input du fichier) engloberait
    // alors le champ "date" tout entier, et un `max` mal place sur "montant"
    // rendrait le test vert a tort. Le lookahead negatif interdit de
    // traverser le debut d'une autre balise <Input, donc chaque match
    // s'arrete a son propre `/>`.
    const balises = src.match(/<Input(?:(?!<Input)[\s\S])*?\/>/g) ?? []
    const champDate = balises.find((b) => /type="date"/.test(b))
    expect(champDate, 'aucun <Input type="date" /> trouve dans le formulaire').not.toBeUndefined()
    expect(champDate).toMatch(/max=\{dateMaxDepense\(/)
  })
})
