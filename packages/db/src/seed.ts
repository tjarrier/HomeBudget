import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formaterEuros, phraseSynthese, resumer } from '@homebudget/domain'
import { sql } from 'drizzle-orm'
import { db, pool } from './client.js'
import { assertBaseEffacable } from './garde-base.js'
import { VERSIONS_INITIALES, importerDepenses } from './import-sheet.js'
import { depense } from './schema.js'

const CSV = readFileSync(
  fileURLToPath(
    new URL('../../../docs/data/sheet-export-2026-07-12/depenses.csv', import.meta.url),
  ),
  'utf-8',
)

const SOLDE_ATTENDU = 114580

const DEFAUT_LOCAL = 'postgresql://homebudget:homebudget@127.0.0.1:5433/homebudget'

async function main() {
  // AVANT la moindre ecriture : on ne truncate pas une base qu'on ne connait pas.
  assertBaseEffacable(
    process.env.DATABASE_URL ?? DEFAUT_LOCAL,
    process.env.HOMEBUDGET_CONFIRME_EFFACEMENT,
  )

  // Tout ou rien : une base a moitie seedee serait pire qu'une base vide.
  await db.transaction(async (tx) => {
    console.log('Purge...')
    await tx.execute(sql`truncate depense, version_config cascade`)

    // Les versions passent par la fonction SQL : elle cloture la precedente la
    // veille. On ne contourne pas le mecanisme append-only, meme pour un seed.
    console.log('Versions de config...')
    const idsParCle = new Map<string, string>()
    for (const v of VERSIONS_INITIALES) {
      const { rows } = await tx.execute<{ id: string }>(sql`
        select * from creer_version_config(
          ${v.libelle}, ${v.dateDebut}::date,
          ${v.salaireNetThomas}, ${v.salaireNetLiz},
          ${JSON.stringify(v.chargesCommunes)}::jsonb,
          ${JSON.stringify(v.chargesPersoThomas)}::jsonb,
          ${JSON.stringify(v.chargesPersoLiz)}::jsonb
        )
      `)
      const creee = rows[0]
      if (!creee) throw new Error(`Version ${v.libelle} : creation sans retour.`)
      idsParCle.set(v.id, creee.id)
      console.log(`  ${v.libelle} — a partir du ${v.dateDebut}`)
    }

    const depenses = importerDepenses(CSV, VERSIONS_INITIALES)
    console.log(`Depenses (${depenses.length})...`)

    await tx.insert(depense).values(
      depenses.map((d) => {
        const versionId = idsParCle.get(d.versionConfigId)
        if (!versionId) throw new Error(`Version inconnue : ${d.versionConfigId}`)
        return {
          date: d.date,
          description: d.description,
          montantCents: d.montant,
          payePar: d.payePar,
          type: d.type,
          modeRepartition: d.mode,
          partThomasCents: d.parts.thomas,
          partLizCents: d.parts.liz,
          versionConfigId: versionId,
          genereAuto: d.genereAuto,
          commentaire: d.commentaire,
        }
      }),
    )

    // Le seed se verifie lui-meme : on RELIT la base et on recalcule. Verifier
    // l'objet qu'on vient de construire en memoire ne prouverait rien.
    const relues = await tx.select().from(depense)
    const resume = resumer(
      relues.map((r) => ({
        id: r.id,
        date: r.date, // Drizzle rend une chaine ISO : rien a convertir.
        description: r.description,
        montant: r.montantCents,
        payePar: r.payePar,
        type: r.type,
        mode: r.modeRepartition,
        parts: { thomas: r.partThomasCents, liz: r.partLizCents },
        versionConfigId: r.versionConfigId,
        genereAuto: r.genereAuto,
        commentaire: r.commentaire,
      })),
    )

    console.log(`\n${phraseSynthese(resume)}`)

    if (resume.soldeThomas !== SOLDE_ATTENDU) {
      // Le throw annule la transaction : la base reste vide plutot que fausse.
      throw new Error(
        `Solde incorrect apres seed : ${formaterEuros(resume.soldeThomas)} au lieu de ${formaterEuros(SOLDE_ATTENDU)}.`,
      )
    }

    console.log('Solde conforme a la reprise du Sheet.')
  })

  await pool.end()
}

main().catch(async (e: Error) => {
  console.error(e.message)
  await pool.end()
  process.exit(1)
})
