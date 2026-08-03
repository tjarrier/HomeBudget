import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * La sauvegarde de la production, verrouillee comme le deploiement l'est deja :
 * les fichiers sont lus comme du texte, sans parseur YAML.
 *
 * Les trois choses qui, si elles cedaient, produiraient une sauvegarde inutile
 * sans qu'aucun run ne passe au rouge : l'artefact d'un depot public ne contient
 * que du chiffre ; rien n'est publie qui n'ait ete restaure et compare ; la
 * commande de restauration du workflow est celle du poste, la meme.
 *
 * Le test vit dans `packages/db` parce que c'est la base qu'on sauvegarde, et
 * qu'il tourne dans la suite unitaire — aucune dependance a Docker.
 */
const RACINE_DEPOT = fileURLToPath(new URL('../../..', import.meta.url))

const lire = (cheminRelatif: string): string =>
  readFileSync(join(RACINE_DEPOT, cheminRelatif), 'utf8')

/**
 * Les commentaires retires : ce qui compte est l'ordre des commandes executees,
 * pas l'ordre dans lequel les commentaires les mentionnent. Le marqueur doit
 * ouvrir la ligne — `--schema=public # les tables` reste une commande.
 */
const sansCommentaires = (contenu: string, marqueur = '#'): string =>
  contenu
    .split('\n')
    .filter((ligne) => !ligne.trimStart().startsWith(marqueur))
    .join('\n')

/** Le corps d'une etape, de son `- name:` jusqu'au suivant. */
const etape = (contenu: string, nom: string): string =>
  contenu.slice(contenu.indexOf(`- name: ${nom}`)).split('- name:')[1] ?? ''

const SCRIPTS = ['scripts/sauvegarder.sh', 'scripts/restaurer.sh', 'scripts/empreinte.sh'] as const

const workflow = sansCommentaires(lire('.github/workflows/sauvegarde.yml'))
const sauvegarder = sansCommentaires(lire('scripts/sauvegarder.sh'))
const restaurer = sansCommentaires(lire('scripts/restaurer.sh'))
const empreinte = sansCommentaires(lire('scripts/empreinte.sql'), '--')
const taskfile = sansCommentaires(lire('Taskfile.yml'))

/**
 * Rien d'autre ne verifie ces scripts : ni `tsc`, ni Biome, ni un test qui les
 * executerait — leur chaine complete a besoin de Docker et d'une vraie base. Or
 * la sauvegarde ne tourne qu'une fois par nuit, sans personne devant.
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
    expect(workflow).not.toMatch(/^\s+environment:/m)
  })

  it('chiffre, restaure, compare, puis publie — dans cet ordre', () => {
    // L'ordre est tout : ce qui atterrit dans l'artefact d'un depot public a
    // deja ete chiffre, puis restaure une fois, puis compare.
    const chiffrement = workflow.indexOf('scripts/sauvegarder.sh')
    const restauration = workflow.indexOf('scripts/restaurer.sh')
    const comparaison = workflow.indexOf('diff')
    const publication = workflow.indexOf('upload-artifact')

    expect(chiffrement).toBeGreaterThan(-1)
    expect(restauration).toBeGreaterThan(chiffrement)
    expect(comparaison).toBeGreaterThan(restauration)
    expect(publication).toBeGreaterThan(comparaison)
  })

  it('ne publie que le fichier chiffre, jamais le dump ni le gzip nu', () => {
    const chemins = [...workflow.matchAll(/^\s+path:\s*(\S+)\s*$/gm)].map(([, chemin]) => chemin)

    expect(chemins.length).toBeGreaterThan(0)
    for (const chemin of chemins) expect(chemin).toMatch(/\.gpg$/)
  })

  it('restaure dans le Postgres du service, jamais sur la production', () => {
    // La confusion qui detruirait la base qu'on sauvegarde. L'assertion est
    // cadree sur l'etape : `URL_PROD` est legitime ailleurs dans le fichier.
    const restauration = etape(workflow, 'Restaurer dans le Postgres vierge du run')

    expect(workflow).toContain('image: postgres:17-alpine')
    expect(restauration).toContain('env.URL_COPIE')
    expect(restauration).not.toContain('env.URL_PROD')
  })

  it("compare l'empreinte des deux cotes, avec le meme script", () => {
    expect(workflow).toContain('./scripts/empreinte.sh "$URL_PROD"')
    expect(workflow).toContain('./scripts/empreinte.sh "$URL_COPIE"')
  })

  it("n'affiche jamais une empreinte : elle porte le compte et les montants", () => {
    expect(workflow).not.toContain('cat empreinte')
    expect(workflow).not.toContain('diff -u')
  })

  it('ne publie pas malgre un ecart : ni `always()`, ni `continue-on-error`', () => {
    expect(workflow).not.toContain('if: always()')
    expect(workflow).not.toContain('continue-on-error: true')
  })

  it('garde la sauvegarde 90 jours, le maximum offert', () => {
    expect(workflow).toContain('retention-days: 90')
  })

  it("derive l'URL en mode session : pg_dump ne passe pas le pooler en transaction", () => {
    expect(workflow).toMatch(/sed -E .*6543.*5432/)
  })

  it("masque l'URL derivee, que GitHub ne masque plus", () => {
    // GitHub masque la valeur du secret, pas ce qu'on en derive. Sans ce masque,
    // un port modifie publie les identifiants de la production dans les logs.
    expect(workflow).toContain('::add-mask::$session')
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

  it('refuse de tourner sans passphrase : aucun dump en clair ne sort de la machine', () => {
    expect(sauvegarder).toMatch(/\$\{BACKUP_PASSPHRASE:\?/)
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
    expect(restaurer).toMatch(/\$\{DATABASE_URL:\?/)
    expect(restaurer).toContain('set -euo pipefail')
  })
})

describe('scripts/empreinte.sql', () => {
  it('enumere les tables au lieu de les lister a la main', () => {
    expect(empreinte).toContain('information_schema.tables')
    expect(empreinte).toContain('query_to_xml')
    expect(empreinte).toContain("'public'")
    expect(empreinte).toContain("'drizzle'")
  })

  it("somme les parts telles qu'elles sont stockees — aucune lecture ne recalcule", () => {
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
    expect(taskfile).not.toContain('--single-transaction')
    expect(taskfile).not.toMatch(/\bgpg\s+-/)
  })
})
