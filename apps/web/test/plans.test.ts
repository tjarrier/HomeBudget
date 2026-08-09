import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Un plan merge dont aucune case n'est cochee ment au lecteur : il affirme que
 * rien n'est fait alors que le code est livre. Onze plans ont derive ainsi,
 * quatre d'entre eux ecrits *apres* l'ouverture de l'issue #33 — la discipline
 * seule ne tient pas, donc c'est un test qui tient.
 *
 * L'echappatoire est nommee : un plan en cours d'execution declare
 * `**Etat :** en cours` et sort du controle. Il ne ment alors a personne, il dit
 * qu'il n'est pas fini. Ce que ce test refuse, c'est le plan *silencieux* :
 * 0 case sur 48, aucun marqueur, et un lecteur qui croit le projet a l'arret.
 *
 * Ce test vit dans `apps/web` pour la meme raison que `deploiement.test.ts` :
 * `pnpm test` n'execute que les tests des paquets du workspace, et la racine
 * n'en est pas un.
 */
const RACINE_DEPOT = fileURLToPath(new URL('../../..', import.meta.url))
const DOSSIER_PLANS = 'docs/superpowers/plans'

/** Le marqueur qui sort un plan du controle, accentue ou non. */
const EN_COURS = /^\*\*[EÉ]tat\s*:\*\*\s*en cours\s*$/im

const plans = readdirSync(join(RACINE_DEPOT, DOSSIER_PLANS))
  .filter((nom) => nom.endsWith('.md'))
  .sort()

describe(DOSSIER_PLANS, () => {
  it('contient des plans — sinon ce test passerait a vide', () => {
    expect(plans.length).toBeGreaterThan(0)
  })

  it.each(plans)('%s reflete son etat reel', (nom) => {
    const contenu = readFileSync(join(RACINE_DEPOT, DOSSIER_PLANS, nom), 'utf8')
    if (EN_COURS.test(contenu)) return

    // Les cases en debut de ligne seulement : le bandeau « For agentic workers »
    // cite `- [ ]` entre backticks pour expliquer la syntaxe, et ce n'est pas une
    // etape.
    const vides = contenu.split('\n').filter((ligne) => /^\s*- \[ \]/.test(ligne))

    expect(
      vides,
      `${nom} porte ${vides.length} case(s) non cochee(s). Coche-les a la cloture de la PR, ou declare « **Etat :** en cours » si le plan n'est pas fini.`,
    ).toEqual([])
  })
})
