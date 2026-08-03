import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * La sauvegarde de la production, verrouillee comme le deploiement l'est deja :
 * en lisant les fichiers comme du texte, sans parseur YAML.
 *
 * Ce que ces assertions protegent n'est pas du style. Ce sont les trois choses
 * qui, si elles cedaient, produiraient une sauvegarde inutile sans qu'aucun run
 * ne passe au rouge :
 *
 * 1. l'artefact d'un depot public ne contient que du chiffre ;
 * 2. rien n'est publie qui n'ait ete restaure et compare ;
 * 3. la commande de restauration du workflow est celle du poste, la meme.
 *
 * Le test vit dans `packages/db` parce que c'est la base qu'on sauvegarde, et
 * qu'il tourne dans la suite unitaire — aucune dependance a Docker.
 */
const RACINE_DEPOT = fileURLToPath(new URL('../../..', import.meta.url))

const lire = (cheminRelatif: string): string =>
  readFileSync(join(RACINE_DEPOT, cheminRelatif), 'utf8')

/**
 * Les commentaires retires : ce qui compte est l'ordre des commandes executees,
 * pas l'ordre dans lequel les commentaires les mentionnent. Le `#` doit ouvrir
 * la ligne — `--schema=public # les tables` reste une commande.
 */
const sansCommentaires = (contenu: string): string =>
  contenu
    .split('\n')
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n')

const sansCommentairesSql = (contenu: string): string =>
  contenu
    .split('\n')
    .filter((ligne) => !/^\s*--/.test(ligne))
    .join('\n')

const SCRIPTS = ['scripts/sauvegarder.sh', 'scripts/restaurer.sh', 'scripts/empreinte.sh'] as const

const workflow = sansCommentaires(lire('.github/workflows/sauvegarde.yml'))
const sauvegarder = sansCommentaires(lire('scripts/sauvegarder.sh'))
const restaurer = sansCommentaires(lire('scripts/restaurer.sh'))
const empreinte = sansCommentairesSql(lire('scripts/empreinte.sql'))
const taskfile = sansCommentaires(lire('Taskfile.yml'))

/**
 * Rien d'autre ne verifie ces scripts : ni `tsc`, ni Biome, ni un test qui les
 * executerait — leur chaine complete a besoin de Docker et d'une vraie base.
 *
 * Or la sauvegarde ne tourne qu'une fois par nuit, sans personne devant. Un
 * script qui ne s'analyse plus ne se decouvre que le jour ou on en a besoin.
 */
describe.each(SCRIPTS)('%s', (chemin) => {
  it('passe `bash -n` — une apostrophe mal placee suffit a le rendre invalide', () => {
    const analyse = spawnSync('bash', ['-n', join(RACINE_DEPOT, chemin)], { encoding: 'utf8' })

    expect(analyse.stderr).toBe('')
    expect(analyse.status).toBe(0)
  })

  it('garde son bit executable, que le workflow et le Taskfile supposent', () => {
    expect(statSync(join(RACINE_DEPOT, chemin)).mode & 0o111).not.toBe(0)
  })
})

describe('sauvegarde.yml', () => {
  it('produit une sauvegarde chaque jour sans intervention, et a la demande', () => {
    expect(workflow).toMatch(/^\s+schedule:/m)
    expect(workflow).toMatch(/^\s+- cron:/m)
    expect(workflow).toContain('workflow_dispatch:')
  })

  it('lit les deux secrets du depot', () => {
    expect(workflow).toContain('secrets.DATABASE_URL')
    expect(workflow).toContain('secrets.BACKUP_PASSPHRASE')
  })

  it('ne declare aucun environment : un reviewer requis suspendrait chaque nuit', () => {
    // `Production` exige une approbation. Un run planifie qui le nommerait
    // attendrait un humain, puis expirerait — et personne ne remarquerait qu'il
    // n'y a plus de sauvegarde. C'est pour ca que les deux secrets sont ceux du
    // depot, et non ceux d'un environment.
    expect(workflow).not.toMatch(/^\s+environment:/m)
  })

  it('chiffre avant de publier — les artefacts d’un depot public se telechargent', () => {
    const chiffrement = workflow.indexOf('scripts/sauvegarder.sh')
    const publication = workflow.indexOf('upload-artifact')

    expect(chiffrement).toBeGreaterThan(-1)
    expect(publication).toBeGreaterThan(chiffrement)
  })

  it('ne publie que le fichier chiffre, jamais le dump ni le gzip nu', () => {
    const chemins = [...workflow.matchAll(/^\s+path:\s*(\S+)\s*$/gm)].map(([, chemin]) => chemin)

    expect(chemins.length).toBeGreaterThan(0)
    for (const chemin of chemins) expect(chemin).toMatch(/\.gpg$/)
  })

  it('restaure la sauvegarde du run dans un Postgres vierge, celui du service', () => {
    expect(workflow).toContain('image: postgres:17-alpine')
    expect(workflow).toContain('scripts/restaurer.sh')
  })

  it("ne publie rien qui n'ait ete restaure puis compare — un dump vide se restaure", () => {
    const restauration = workflow.indexOf('scripts/restaurer.sh')
    const comparaison = workflow.indexOf('diff')
    const publication = workflow.indexOf('upload-artifact')

    expect(restauration).toBeGreaterThan(-1)
    expect(comparaison).toBeGreaterThan(restauration)
    expect(publication).toBeGreaterThan(comparaison)
  })

  it("compare l'empreinte des deux cotes, avec le meme script", () => {
    expect(workflow).toContain('./scripts/empreinte.sh "$URL_PROD"')
    expect(workflow).toContain('./scripts/empreinte.sh "$URL_COPIE"')
  })

  it("n'affiche jamais une empreinte : elle porte le compte et les montants", () => {
    // Les logs d'un depot public se lisent sans compte. Le `diff` du workflow
    // compte les lignes d'ecart et n'en imprime aucune ; `cat` ou `diff -u`
    // publieraient la somme des parts du couple.
    expect(workflow).not.toContain('cat empreinte')
    expect(workflow).not.toContain('diff -u')
  })

  it("publie meme si l'empreinte diverge n'est pas une option", () => {
    expect(workflow).not.toContain('if: always()')
    expect(workflow).not.toContain('continue-on-error: true')
  })

  it('garde la sauvegarde 90 jours, le maximum offert', () => {
    expect(workflow).toContain('retention-days: 90')
  })

  it('derive l’URL en mode session : pg_dump ne passe pas le pooler en transaction', () => {
    expect(workflow).toContain('6543')
    expect(workflow).toContain('5432')
  })

  it('ne laisse pas deux sauvegardes se disputer le meme run', () => {
    expect(workflow).toContain('cancel-in-progress: false')
  })

  it('ne reimplemente ni le dump ni la restauration : les scripts sont la source', () => {
    expect(workflow).not.toContain('pg_dump')
    expect(workflow).not.toContain('--single-transaction')
  })
})

describe('scripts/sauvegarder.sh', () => {
  it('prend `public` et `drizzle` — sans le journal, la base restauree se croit vierge', () => {
    expect(sauvegarder).toContain('--schema=public')
    expect(sauvegarder).toContain('--schema=drizzle')
  })

  it("emporte btree_gist, qu'aucun `--schema` ne ramasse", () => {
    // Les extensions n'appartiennent a aucun schema. Le journal des migrations,
    // restaure lui aussi, declare `0001` appliquee : sans cette option,
    // l'extension ne serait jamais reposee sur la base de secours.
    expect(sauvegarder).toContain('--extension=btree_gist')
  })

  it('laisse dehors les roles de Supabase, absents partout ailleurs', () => {
    expect(sauvegarder).toContain('--no-owner')
    expect(sauvegarder).toContain('--no-privileges')
  })

  it("n'ecrase pas : un dump lache par erreur doit echouer, pas nettoyer", () => {
    expect(sauvegarder).not.toContain('--clean')
  })

  it('fige la version du client pg_dump, qui doit valoir celle du serveur', () => {
    expect(sauvegarder).toContain('postgres:17-alpine')
  })

  it("s'arrete des qu'un maillon du tube casse, au lieu de chiffrer du vide", () => {
    expect(sauvegarder).toContain('set -euo pipefail')
  })

  it('chiffre en AES256 sans jamais poser la passphrase sur la ligne de commande', () => {
    expect(sauvegarder).toContain('--symmetric')
    expect(sauvegarder).toContain('AES256')
    expect(sauvegarder).toContain('--passphrase-fd')
    expect(sauvegarder).not.toMatch(/--passphrase[ =]"?\$/)
  })
})

describe('scripts/restaurer.sh', () => {
  it('annule tout a la premiere erreur, au lieu de charger les COPY quand meme', () => {
    expect(restaurer).toContain('ON_ERROR_STOP=1')
    expect(restaurer).toContain('--single-transaction')
  })

  it("n'efface rien : visee sur une base peuplee, elle echoue sans rien toucher", () => {
    expect(restaurer).not.toContain('--clean')
    // Le `drop schema public` que le dump impose est en RESTRICT. Un `cascade`
    // ici transformerait la restauration en effacement silencieux : Postgres ne
    // refuserait plus rien, et une sauvegarde visee sur la mauvaise base
    // remplacerait son contenu au lieu de s'arreter.
    expect(restaurer).not.toMatch(/cascade/i)
  })

  it('joint le Postgres du poste comme celui du runner', () => {
    expect(restaurer).toContain('--network host')
  })

  it('prend la passphrase par un descripteur, jamais par la ligne de commande', () => {
    expect(restaurer).toContain('--passphrase-fd')
    expect(restaurer).not.toMatch(/--passphrase[ =]"?\$/)
  })

  it('refuse de tourner sans DATABASE_URL au lieu de viser une base par defaut', () => {
    expect(restaurer).toContain('DATABASE_URL')
    expect(restaurer).toMatch(/set -euo pipefail/)
  })
})

describe('scripts/empreinte.sql', () => {
  it('enumere les tables au lieu de les lister a la main', () => {
    expect(empreinte).toContain('information_schema.tables')
    expect(empreinte).toContain('query_to_xml')
    expect(empreinte).toContain("'public'")
    expect(empreinte).toContain("'drizzle'")
  })

  it('somme les parts telles qu’elles sont stockees — aucune lecture ne recalcule', () => {
    expect(empreinte).toContain('sum(part_thomas_cents)')
    expect(empreinte).toContain('sum(part_liz_cents)')
    expect(empreinte).not.toMatch(/round\(/i)
    expect(empreinte).not.toMatch(/ratio/i)
  })

  it('trie sa sortie : un diff sur deux ordres de lignes ne veut rien dire', () => {
    expect(empreinte).toMatch(/order by/i)
  })
})

describe('task db:restaurer', () => {
  it('existe, et attend le fichier chiffre', () => {
    expect(taskfile).toContain('db:restaurer:')
    expect(taskfile).toContain('FICHIER')
  })

  it('joue le script du workflow, et ne redit pas la commande a sa facon', () => {
    expect(taskfile).toContain('./scripts/restaurer.sh')
    // Recopier la commande ici aurait cree une seconde procedure — et c'est
    // justement celle que personne n'aurait verifiee.
    expect(taskfile).not.toContain('--single-transaction')
    expect(taskfile).not.toMatch(/\bgpg\s+-/)
  })
})
