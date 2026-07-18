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
