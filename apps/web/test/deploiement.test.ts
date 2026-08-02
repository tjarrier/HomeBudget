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

/**
 * Les lignes de commentaire retirées : ce qui compte est l'ordre des commandes
 * exécutées, pas l'ordre dans lequel les commentaires les mentionnent.
 */
const sansCommentaires = (contenu: string): string =>
  contenu
    .split('\n')
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n')

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

  it('se declenche au push', () => {
    // Pousser suffit a lancer la verification, PR ouverte ou pas.
    expect(ci).toMatch(/^\s+push:/m)
  })

  it("sauf sur `main`, ou c'est le deploiement qui l'appelle", () => {
    // Sur `main`, c'est `deploy-preview.yml` qui appelle la CI. L'y declencher
    // aussi au push ferait tourner deux fois Postgres et Playwright a chaque
    // merge, pour deux verdicts qu'il faudrait ensuite comparer.
    expect(ci).toMatch(/^\s+branches-ignore: \[main\]$/m)
  })
})

/**
 * Les regles qui valent pour les deux workflows de deploiement.
 */
const WORKFLOWS_DE_DEPLOIEMENT = [
  ['deploy-preview.yml', lire('.github/workflows/deploy-preview.yml')],
  ['deploy-production.yml', lire('.github/workflows/deploy-production.yml')],
] as const

describe.each(WORKFLOWS_DE_DEPLOIEMENT)('%s', (_nom, contenu) => {
  it('ne deploie que derriere la CI, en la reutilisant telle quelle', () => {
    expect(contenu).toContain('uses: ./.github/workflows/ci.yml')
    expect(contenu).toContain('needs: verif')
  })

  it('construit, puis migre, puis promeut', () => {
    // L'ordre qui coûte de l'argent s'il tombe. Construire d'abord : rien ne
    // s'écrit en base avant qu'un artefact existe. Migrer avant de promouvoir :
    // du code neuf ne parle jamais à un schéma vieux.
    const etapes = sansCommentaires(contenu)
    const construction = etapes.indexOf('vercel build')
    const migration = etapes.indexOf('db:migrate')
    const promotion = etapes.indexOf('vercel deploy')

    expect(construction).toBeGreaterThan(-1)
    expect(migration).toBeGreaterThan(construction)
    expect(promotion).toBeGreaterThan(migration)
  })

  it("aligne DATABASE_URL sur le secret GitHub avant d'en dependre", () => {
    // Il n'y a plus deux sources pour une seule base : le secret GitHub est la
    // seule, et le workflow la recopie dans le projet Vercel. Les deux ne peuvent
    // plus diverger — par construction, et non plus par verification.
    //
    // La verification qui vivait ici ne pouvait pas fonctionner : `DATABASE_URL`
    // est marquee *Sensitive* cote Vercel, donc `vercel pull` en ecrit la chaine
    // `[SENSITIVE]` et jamais la valeur. Elle comparait une empreinte reelle a une
    // constante, et echouait a chaque run.
    //
    // L'alignement precede la construction, donc aussi la migration et la
    // promotion : a partir de la, tout le monde vise la meme base.
    const etapes = sansCommentaires(contenu)
    const alignement = etapes.indexOf('/env?upsert=true')

    expect(alignement).toBeGreaterThan(-1)
    expect(etapes.indexOf('vercel build')).toBeGreaterThan(alignement)
  })

  it("n'aligne pas DATABASE_URL par la CLI, qui pose une question", () => {
    // `vercel env add DATABASE_URL preview --force --sensitive --yes` a tourne en
    // production et n'a rien ecrit. Malgre `--yes`, la CLI demande :
    //
    //   Leave empty to apply to all Preview branches.
    //   ? Git branch?
    //
    // Le pipe fournit la valeur puis EOF, la CLI abandonne — et sort en 0.
    // L'etape s'est declaree verte pendant que l'application continuait de parler
    // a l'ancienne base. On passe par l'API, qui ne pose aucune question.
    expect(sansCommentaires(contenu)).not.toContain('vercel env add')
  })

  it('ecrase DATABASE_URL au lieu de la supprimer puis la recreer', () => {
    // Un `rm` suivi d'un `add` ouvre une fenetre — courte, mais reelle — ou la
    // variable n'existe plus. Un run qui echoue entre les deux laisse
    // l'application sans base. `upsert` ecrase en une seule operation.
    const etapes = sansCommentaires(contenu)

    expect(etapes).toContain('upsert=true')
    expect(etapes).not.toContain('vercel env rm')
    expect(etapes).not.toContain('-X DELETE')
  })

  it('conserve le drapeau Sensitive en reecrivant DATABASE_URL', () => {
    // Sans lui, l'ecrasement rendrait la valeur lisible par tout token ayant
    // acces au projet. On aligne la valeur, on ne degrade pas sa protection.
    expect(sansCommentaires(contenu)).toContain('"sensitive"')
  })

  it("verifie que l'ecriture a eu lieu, au lieu de croire le code de sortie", () => {
    // La lecon du run qui a menti : une commande peut sortir en 0 sans rien
    // faire. On lit le code HTTP de la reponse, et on echoue s'il n'est pas bon.
    const etapes = sansCommentaires(contenu)

    expect(etapes).toContain('http_code')
    expect(etapes).toMatch(/http_code[\s\S]*?exit 1/)
  })

  it("n'utilise jamais drizzle-kit push, qui supprimerait nos garde-fous", () => {
    // Les lignes de commentaire sont retirees : ce qui est interdit, c'est
    // d'executer la commande, pas de dire pourquoi elle est interdite.
    expect(sansCommentaires(contenu)).not.toContain('drizzle-kit push')
  })

  it('declare son environment GitHub, la ou vit DATABASE_URL', () => {
    expect(contenu).toMatch(/environment: (Preview|Production)/)
  })

  it('fait tourner la CLI Vercel a la racine du depot', () => {
    // Le Root Directory du projet vaut `apps/web`, et la CLI *joint* ce reglage
    // au repertoire courant. Lancee depuis `apps/web`, elle cherche donc
    // `apps/web/apps/web`, qui n'existe pas. `vercel build` s'en tire par un
    // repli — avec un avertissement que personne ne lit — mais
    // `vercel deploy --prebuilt` echoue net :
    //
    //   Error: The provided path ".../apps/web/apps/web" does not exist.
    //
    // La CLI tourne donc a la racine, et c'est `rootDirectory` qui la mene dans
    // `apps/web`. Le fichier tire par `vercel pull` atterrit a la racine lui
    // aussi : l'etape qui y lit BETTER_AUTH_URL suit le meme chemin.
    //
    // On refuse toute ecriture du chemin, pas la seule forme nue : `./apps/web`
    // et `${{ github.workspace }}/apps/web` designent le meme repertoire et
    // reintroduiraient exactement le meme bug.
    expect(sansCommentaires(contenu)).not.toMatch(/working-directory:.*apps\/web/)
  })

  it('ne laisse pas deux migrations courir sur la meme base', () => {
    expect(contenu).toContain('cancel-in-progress: false')
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

  it("fait echouer le run des que l'alias attendu manque, sur n'importe quelle ref", () => {
    // Un garde-fou `if [ "$REF" = "main" ]` vivait ici, parce qu'on croyait
    // l'alias fabrique a partir de la ref : sur une autre branche, l'ecart aurait
    // ete normal. Le premier run reel a dementi la croyance. L'alias d'auteur
    // `<projet>-<utilisateur>-<scope>` est attribue a tout deploiement de la CLI,
    // quelle que soit la branche — les hotes `-git-<branche>-` viennent de
    // l'integration Git, que `vercel.json` coupe.
    //
    // La verification vaut donc partout, et sauter le controle sur les autres refs
    // ne ferait que masquer une anomalie reelle.
    const etapes = sansCommentaires(preview)

    expect(etapes).not.toContain('$REF" = "main"')
    expect(etapes).toMatch(/grep -qxF "\$hostname"[\s\S]*?exit 1/)
  })
})

describe('deploy-production.yml', () => {
  const production = lire('.github/workflows/deploy-production.yml')

  it('ne se declenche que sur un tag de version', () => {
    // Aucun declencheur de branche : la production ne suit pas `main` commit par
    // commit, elle suit des versions.
    expect(production).toMatch(/^on:\n\s+push:\n\s+tags:\n/m)
    expect(production).toContain('v[0-9]+.[0-9]+.[0-9]+')
    expect(production).not.toContain('branches:')
  })

  it('refuse un tag pose hors de main', () => {
    expect(production).toContain('merge-base --is-ancestor')
  })

  it('refuse le tag avant de jouer la CI, pas apres', () => {
    // Un job de garde, pas une etape dans `deploy` : un tag pose sur un commit
    // hors `main` est refuse en dix secondes, sans brûler Postgres ni Playwright.
    expect(production).toContain('merge-base --is-ancestor')
    expect(production).toMatch(/verif:\n\s+needs: garde/)
    expect(production.indexOf('merge-base --is-ancestor')).toBeLessThan(
      production.indexOf('uses: ./.github/workflows/ci.yml'),
    )
    expect(production).toContain('needs: garde')
  })

  it('promeut en production', () => {
    expect(production).toContain('vercel deploy --prebuilt --prod')
  })

  it('ne peut pas etre declenche a la main', () => {
    // Sinon rien n'empeche de promouvoir un commit de `main` sans version, ce
    // que la garde d'ancetre ne bloquerait pas : ce n'est pas une garde de
    // securite, c'est une garde de conception.
    expect(sansCommentaires(production)).not.toContain('workflow_dispatch')
  })
})
