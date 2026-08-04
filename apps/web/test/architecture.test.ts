import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const DOSSIERS = ['app', 'actions', 'lib', 'components']

function fichiersTs(dossier: string): string[] {
  const chemin = join(RACINE, dossier)
  const trouves: string[] = []
  const parcourir = (d: string) => {
    for (const entree of readdirSync(d)) {
      const complet = join(d, entree)
      if (statSync(complet).isDirectory()) parcourir(complet)
      else if (/\.tsx?$/.test(entree)) trouves.push(complet)
    }
  }
  try {
    parcourir(chemin)
  } catch {
    // Dossier absent : rien a verifier.
  }
  return trouves
}

/**
 * Motifs de detection d'une requete SQL ecrite en dur dans l'UI.
 *
 * Le motif naif `/\b(select|insert into|update .* set|delete from)\b/i`, applique
 * au fichier entier, matche le JSX `<select name="payePar">` que ce plan ecrit
 * lui-meme dans `formulaire-depense.tsx` et `formulaire-version.tsx`, ainsi que
 * les `data-slot="select-..."` de `components/ui/select.tsx` (shadcn) : le seul
 * mot "select" suffit a le declencher, sur du code parfaitement correct.
 *
 * On resserre donc le motif a `select...from` (avec une fenetre bornee, pour ne
 * pas matcher un `<select>` ici et un `from` sans rapport 200 caracteres plus
 * loin dans le meme fichier), et on l'applique LIGNE PAR LIGNE plutot qu'au
 * fichier entier : un commentaire comme « Aucun SELECT n'additionne de solde. »
 * (app/(app)/page.tsx) contient le mot SELECT mais aucun "from" sur la meme
 * ligne, donc ne matche jamais un motif applique ligne par ligne.
 *
 * Mais ligne par ligne SANS ignorer les imports se reprend un faux positif :
 * `import { Select as SelectPrimitive } from '@base-ui/react/select'`
 * (composant shadcn `select.tsx`) contient "Select" (l'import nomme) PUIS
 * "from" sur la meme ligne : ca matche `select...from` a soi seul. On saute
 * donc les lignes qui font partie d'une declaration d'import (mono ou
 * multi-lignes), ce qui est sans danger : une requete SQL ecrite en dur ne se
 * cache jamais dans un import.
 */
const MOTIFS_SQL = [
  /\bselect\b[\s\S]{0,200}?\bfrom\b/i,
  /\binsert\s+into\b/i,
  /\bdelete\s+from\b/i,
  /\bupdate\b[\s\S]{0,120}?\bset\b/i,
  /\bsql`/,
]

/** Lignes a ignorer : une declaration d'import, mono ou multi-lignes. */
function lignesHorsImports(contenu: string): string[] {
  const retenues: string[] = []
  let dansImport = false

  for (const ligne of contenu.split('\n')) {
    if (dansImport) {
      // Une ligne d'import multi-lignes se termine quand `from '...'` apparait.
      if (/\bfrom\s+['"]/.test(ligne)) dansImport = false
      continue
    }
    if (/^\s*import\b/.test(ligne)) {
      // Import mono-ligne (contient deja son `from '...'`) ou debut d'un import
      // multi-lignes (ex. `import {`), qui se poursuivra sur les lignes suivantes.
      if (!/\bfrom\s+['"]/.test(ligne)) dansImport = true
      continue
    }
    retenues.push(ligne)
  }

  return retenues
}

describe("apps/web n'accede jamais a la base directement", () => {
  it('n importe ni drizzle-orm, ni pg, ni le client interne de packages/db', () => {
    // La facade de packages/db est le SEUL point de contact. Un import direct
    // rouvrirait la porte a du SQL dans l'UI, donc a un recalcul de part.
    const interdits = [/from ['"]drizzle-orm/, /from ['"]pg['"]/, /client\.js['"]/, /\bpool\b/]
    const fautifs: string[] = []

    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTs(dossier)) {
        const contenu = readFileSync(fichier, 'utf-8')
        if (interdits.some((motif) => motif.test(contenu))) {
          fautifs.push(fichier.replace(RACINE, ''))
        }
      }
    }

    expect(fautifs).toEqual([])
  })

  it("n'ecrit aucune requete SQL", () => {
    const fautifs: string[] = []

    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTs(dossier)) {
        const contenu = readFileSync(fichier, 'utf-8')
        const lignesUtiles = lignesHorsImports(contenu)
        const suspect = lignesUtiles.some((ligne) => MOTIFS_SQL.some((motif) => motif.test(ligne)))
        if (suspect) fautifs.push(fichier.replace(RACINE, ''))
      }
    }

    expect(fautifs).toEqual([])
  })
})

/**
 * La facade autorisee de `@homebudget/db`. Liste BLANCHE, volontairement : une
 * liste noire de motifs interdits ne protege que de ce qu'on a su prevoir, et
 * `packages/db/src/index.ts` reexporte `db` (le client Drizzle brut) ainsi que
 * les tables de Better Auth. Un composant qui ecrirait
 * `db.select().from(depense)` en chainage multi-lignes echapperait a MOTIFS_SQL
 * (qui ne matche `select...from` que sur une meme ligne) : c'est l'import qu'il
 * faut fermer, pas la requete.
 *
 * Ajouter un nom ici est une decision d'architecture : la valeur par defaut est
 * de le refuser, et d'elargir plutot la facade de `packages/db`.
 */
const FACADE_DB = [
  'listerVersions',
  'listerDepenses',
  'ajouterDepense',
  'creerVersion',
  'calculerPartsPourSaisie',
  'genererChargeFixeDuMois',
  'SaisieDepense',
  'SaisieVersion',
]

/**
 * L'UNIQUE exception, explicite et justifiee : Better Auth exige l'instance
 * Drizzle elle-meme (`drizzleAdapter(db, ...)`) et les objets de tables de son
 * schema. Aucune facade ne peut se substituer a cela. Ce fichier ne contient
 * aucune requete metier — il cable l'adaptateur, rien de plus.
 *
 * Toute autre entree dans cette liste doit etre justifiee ici de la meme
 * maniere ; a defaut, c'est une regression.
 */
const EXCEPTIONS_ACCES_DB = ['lib/auth.ts']

/** Les noms importes depuis `@homebudget/db`, imports mono ou multi-lignes. */
function importsDepuisDb(contenu: string): string[] {
  const noms: string[] = []
  // La clause est soit un bloc `{...}` (qui peut s'etaler sur plusieurs lignes,
  // d'ou `[^}]`), soit une clause sans accolades bornee a UNE ligne. Un `[\s\S]*?`
  // libre traverserait l'import precedent et rapporterait ses noms a tort.
  const motif = /import\s+(\{[^}]*\}|[^;\n]*?)\s+from\s+['"]@homebudget\/db['"]/g

  for (const [, clause] of contenu.matchAll(motif)) {
    if (!clause) continue
    const accolades = clause.match(/\{([\s\S]*)\}/)
    if (!accolades?.[1]) {
      // `import db from ...` ou `import * as db from ...` : jamais legitime,
      // on le signale sous un nom parlant.
      noms.push(clause.trim() || '(import sans accolades)')
      continue
    }
    for (const brut of accolades[1].split(',')) {
      const nom = brut.replace(/^\s*type\s+/, '').trim()
      // `x as y` : c'est `x` qui vient du paquet.
      const source = nom.split(/\s+as\s+/)[0]?.trim()
      if (source) noms.push(source)
    }
  }

  return noms
}

describe("apps/web n'importe de packages/db que sa facade", () => {
  it('n importe ni `db`, ni une table, hors de l exception commentee lib/auth.ts', () => {
    const fautifs: string[] = []

    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTs(dossier)) {
        const relatif = fichier.replace(RACINE, '')
        if (EXCEPTIONS_ACCES_DB.includes(relatif)) continue

        const hors = importsDepuisDb(readFileSync(fichier, 'utf-8')).filter(
          (nom) => !FACADE_DB.includes(nom),
        )
        for (const nom of hors) fautifs.push(`${relatif} : ${nom}`)
      }
    }

    expect(fautifs).toEqual([])
  })

  it("l'exception ne couvre qu'un fichier reellement present", () => {
    // Une exception qui pointe un fichier disparu est une porte laissee
    // ouverte pour rien : on veut qu'elle tombe avec le fichier.
    for (const relatif of EXCEPTIONS_ACCES_DB) {
      expect(() => statSync(join(RACINE, relatif))).not.toThrow()
    }
  })
})

describe('chaque Server Action exige une session', () => {
  it('appelle exigerSession() avant tout traitement', () => {
    // Une Server Action est un endpoint HTTP joignable sans charger la page.
    // `exigerSession()` en premiere ligne est la garde reelle — le layout et
    // le middleware ne suffisent pas. Ce test verrouille la regle pour toute
    // action AJOUTEE PLUS TARD, qui autrement se croirait protegee par la page.
    const actions = fichiersTs('actions').filter((f) => !/\bresultat\.ts$/.test(f))

    // Si le glob ne trouve plus rien (dossier renomme), le test doit crier
    // plutot que de passer sur une liste vide.
    expect(actions.length).toBeGreaterThan(0)

    const sansGarde = actions
      .filter((f) => !/\bexigerSession\s*\(/.test(readFileSync(f, 'utf-8')))
      .map((f) => f.replace(RACINE, ''))

    expect(sansGarde).toEqual([])
  })
})

describe('chaque page du groupe (app) exige une session', () => {
  it('appelle exigerSession(), sans dependre du rendu du layout', () => {
    // Next.js ne garantit PAS de re-rendre un layout a chaque requete d'un
    // segment — sa documentation deconseille explicitement d'y placer le
    // controle d'acces. Et `middleware.ts` ne fait qu'une verification
    // optimiste : `getSessionCookie()` constate la presence du cookie sans en
    // verifier la signature. La garde reelle est donc dans chaque page ; le
    // layout n'est que de la defense en profondeur. Ce test verrouille la
    // regle pour toute page AJOUTEE PLUS TARD, qui autrement se croirait
    // protegee par le layout.
    const pages = fichiersTs(join('app', '(app)')).filter((f) => /[/\\]page\.tsx$/.test(f))

    // Si le glob ne trouve plus rien (dossier renomme), le test doit crier
    // plutot que de passer sur une liste vide.
    expect(pages.length).toBeGreaterThan(0)

    const sansGarde = pages
      .filter((f) => !/\bexigerSession\s*\(/.test(readFileSync(f, 'utf-8')))
      .map((f) => f.replace(RACINE, ''))

    expect(sansGarde).toEqual([])
  })
})
