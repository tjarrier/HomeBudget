import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Ce test vit dans `apps/web` parce que c'est le paquet deploye — `vercel.json`
 * y est desormais, et `pnpm test` n'execute que les tests des paquets du
 * workspace. Il ne parle pas d'interface : il verrouille le contrat de
 * deploiement.
 *
 * Il n'y a pas de parseur YAML dans le projet et on n'en ajoute pas un pour ca :
 * les workflows sont lus comme du texte. Ce que ces assertions protegent, ce
 * n'est pas du style — c'est l'ordre `db:migrate` avant `vercel deploy`. Du code
 * neuf qui parle a un schema vieux ne se rattrape pas apres coup.
 */
const RACINE_DEPOT = fileURLToPath(new URL('../../..', import.meta.url))

const lire = (cheminRelatif: string): string =>
  readFileSync(join(RACINE_DEPOT, cheminRelatif), 'utf8')

describe('vercel.json', () => {
  it("coupe les deploiements de l'integration Git", () => {
    const config = JSON.parse(lire('apps/web/vercel.json'))

    expect(config.git.deploymentEnabled).toBe(false)
  })

  it('vit dans le Root Directory du projet, seul endroit ou Vercel le lit', () => {
    // Le Root Directory vaut `apps/web`. Un `vercel.json` a la racine du depot
    // serait ignore en silence : `deploymentEnabled: false` n'aurait aucun effet
    // et un merge dans `main` continuerait de partir en production.
    expect(existsSync(join(RACINE_DEPOT, 'vercel.json'))).toBe(false)
    expect(existsSync(join(RACINE_DEPOT, 'apps/web/vercel.json'))).toBe(true)
  })
})

describe('ci.yml', () => {
  const ci = lire('.github/workflows/ci.yml')

  it('est appelable par les workflows de deploiement', () => {
    // Une seule definition de « verifie ». Les deux workflows de deploiement
    // l'appellent au lieu d'en recopier les etapes.
    expect(ci).toContain('workflow_call:')
  })

  it('ne se declenche plus sur push', () => {
    // Sur `main`, c'est `deploy-preview.yml` qui appelle la CI. Garder le
    // declencheur `push` ferait tourner deux fois Postgres et Playwright a
    // chaque merge, pour deux verdicts qu'il faudrait ensuite comparer.
    expect(ci).not.toMatch(/^\s+push:/m)
  })
})

/**
 * Les regles qui valent pour les deux workflows de deploiement. La tache 4 y
 * ajoute `deploy-production.yml` ; l'entree unique ci-dessous n'est pas un oubli
 * a ce stade du plan.
 */
const WORKFLOWS_DE_DEPLOIEMENT = [
  ['deploy-preview.yml', lire('.github/workflows/deploy-preview.yml')],
] as const

describe.each(WORKFLOWS_DE_DEPLOIEMENT)('%s', (_nom, contenu) => {
  it('ne deploie que derriere la CI, en la reutilisant telle quelle', () => {
    expect(contenu).toContain('uses: ./.github/workflows/ci.yml')
    expect(contenu).toContain('needs: verif')
  })

  it('migre la base avant de promouvoir le code', () => {
    // La regle qui coute de l'argent si elle tombe : une migration qui echoue
    // doit arreter le deploiement avant que du code neuf ne parle a un schema
    // vieux. Ce test compare des positions dans le fichier, donc aucun
    // commentaire ne doit mentionner `vercel deploy` avant l'etape de migration.
    const migration = contenu.indexOf('db:migrate')
    const promotion = contenu.indexOf('vercel deploy')

    expect(migration).toBeGreaterThan(-1)
    expect(promotion).toBeGreaterThan(-1)
    expect(migration).toBeLessThan(promotion)
  })

  it("n'utilise jamais drizzle-kit push, qui supprimerait nos garde-fous", () => {
    expect(contenu).not.toContain('drizzle-kit push')
  })

  it('declare son environment GitHub, la ou vit DATABASE_URL', () => {
    expect(contenu).toMatch(/environment: (Preview|Production)/)
  })

  it('fait tourner la CLI Vercel dans le Root Directory du projet', () => {
    // Le Root Directory vaut `apps/web`. Une commande `vercel` lancee a la
    // racine du depot ne trouverait pas le projet.
    expect(contenu).toContain('working-directory: apps/web')
  })
})

describe('deploy-preview.yml', () => {
  const preview = lire('.github/workflows/deploy-preview.yml')

  it('publie au merge dans main, et a la demande', () => {
    expect(preview).toContain('branches: [main]')
    expect(preview).toContain('workflow_dispatch:')
  })

  it('ne promeut jamais en production', () => {
    expect(preview).not.toContain('--prod')
  })

  it('ne laisse pas deux migrations courir sur la meme base', () => {
    expect(preview).toContain('cancel-in-progress: false')
  })
})
