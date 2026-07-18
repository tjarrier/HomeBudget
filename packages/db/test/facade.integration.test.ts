import { formaterEuros, phraseSynthese, resumer } from '@homebudget/domain'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from '../src/client.js'
import { ajouterDepense } from '../src/ecriture.js'
import { VERSIONS_INITIALES, importerDepenses } from '../src/import-sheet.js'
import { listerDepenses, listerVersions } from '../src/lecture.js'
import { depense } from '../src/schema.js'

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  await db.execute(sql`truncate depense, version_config cascade`)
})

async function creerVersion(libelle: string, dateDebut: string): Promise<{ id: string }> {
  const { rows } = await db.execute<{ id: string }>(sql`
    select * from creer_version_config(
      ${libelle}, ${dateDebut}::date, 330000, 180000,
      ${JSON.stringify([{ libelle: 'Loyer', montant: 78500 }])}::jsonb,
      '[]'::jsonb, '[]'::jsonb
    )
  `)
  const version = rows[0]
  if (!version) throw new Error('creer_version_config n a rien renvoye')
  return version
}

describe('listerVersions', () => {
  it('rend les versions de la plus ancienne a la plus recente, dates en chaines ISO', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01')

    const versions = await listerVersions()

    expect(versions.map((v) => v.libelle)).toEqual(['v1', 'v2'])
    expect(versions[0]?.dateDebut).toBe('2025-07-01')
    // La creation de v2 a cloture v1 LA VEILLE de sa prise d'effet.
    expect(versions[0]?.dateFin).toBe('2026-06-30')
    expect(versions[1]?.dateFin).toBeNull()
    expect(typeof versions[0]?.dateDebut).toBe('string')
  })
})

describe('listerDepenses', () => {
  it('rend les parts figees, jamais recalculees', async () => {
    const v = await creerVersion('v1', '2026-07-01')
    // Des parts volontairement absurdes au regard du ratio : elles doivent
    // ressortir TELLES QUELLES. Toute lecture qui les "corrige" recalcule, donc
    // reintroduit le bug du Sheet.
    await db.insert(depense).values({
      date: '2026-07-05',
      description: 'Parts figees a la main',
      montantCents: 10000,
      payePar: 'thomas',
      type: 'courante',
      modeRepartition: 'personnalise',
      partThomasCents: 9000,
      partLizCents: 1000,
      versionConfigId: v.id,
      genereAuto: false,
      commentaire: null,
    })

    const depenses = await listerDepenses()

    expect(depenses).toHaveLength(1)
    expect(depenses[0]?.parts).toEqual({ thomas: 9000, liz: 1000 })
  })
})

describe('ajouterDepense — I2, snapshot on write', () => {
  /**
   * Le piege central du projet, exerce explicitement. Deux versions aux ratios
   * DIFFERENTS, et une depense ANTIDATEE dans la premiere. Une implementation
   * qui attrape la version courante (`date_fin is null`) produirait des parts
   * qui somment au bon montant mais au MAUVAIS ratio — et passerait le CHECK.
   */
  async function deuxVersions(): Promise<{ ancienne: string; courante: string }> {
    // v1 : salaires 300000 / 100000  -> ratio Thomas = 0,75
    const { rows: r1 } = await db.execute<{ id: string }>(sql`
      select * from creer_version_config(
        'v1 ratio 75', '2025-01-01'::date, 300000, 100000, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
    `)
    // v2 : salaires 100000 / 300000  -> ratio Thomas = 0,25
    const { rows: r2 } = await db.execute<{ id: string }>(sql`
      select * from creer_version_config(
        'v2 ratio 25', '2026-01-01'::date, 100000, 300000, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
    `)
    const ancienne = r1[0]?.id
    const courante = r2[0]?.id
    if (!ancienne || !courante) throw new Error('creer_version_config n a rien renvoye')
    return { ancienne, courante }
  }

  it('fige les parts d apres la version A LA DATE, pas la version courante', async () => {
    const { ancienne } = await deuxVersions()

    const d = await ajouterDepense({
      date: '2025-06-15', // dans v1, ratio 0,75 — v2 est la courante, ratio 0,25
      description: 'Course antidatee',
      montant: 10000,
      payePar: 'thomas',
      type: 'charge_fixe',
      mode: 'prorata',
    })

    expect(d.parts).toEqual({ thomas: 7500, liz: 2500 }) // et NON { 2500, 7500 }
    expect(d.versionConfigId).toBe(ancienne)
    expect(d.parts.thomas + d.parts.liz).toBe(d.montant)
  })

  it('fige au ratio courant une depense datee dans la version courante', async () => {
    // Le pendant du test precedent : interdire la sur-correction.
    const { courante } = await deuxVersions()

    const d = await ajouterDepense({
      date: '2026-03-10',
      description: 'Course du mois',
      montant: 10000,
      payePar: 'liz',
      type: 'charge_fixe',
      mode: 'prorata',
    })

    expect(d.parts).toEqual({ thomas: 2500, liz: 7500 })
    expect(d.versionConfigId).toBe(courante)
  })

  it('refuse une depense a une date qu aucune version ne couvre', async () => {
    await deuxVersions()
    await expect(
      ajouterDepense({
        date: '2024-01-01',
        description: 'Avant toute config',
        montant: 5000,
        payePar: 'thomas',
        type: 'courante',
        mode: 'moitie',
      }),
    ).rejects.toThrow(/Aucune version de config ne couvre/i)
  })

  it('donne au payeur une part nulle sur un transfert — la dette du payeur BAISSE', async () => {
    // Le piege qui coute de l'argent : `transfert` n'est PAS « 100 % au payeur ».
    // Liz verse 400 € : part_liz = 0, part_thomas = 400, solde_liz = +400.
    await deuxVersions()

    const d = await ajouterDepense({
      date: '2026-03-10',
      description: 'Virement Liz vers Thomas',
      montant: 40000,
      payePar: 'liz',
      type: 'transfert',
      mode: 'transfert',
    })

    expect(d.parts).toEqual({ thomas: 40000, liz: 0 })
    expect(resumer([d]).soldeLiz).toBe(40000)
  })

  it('accepte des parts personnalisees qui somment au montant', async () => {
    await deuxVersions()
    const d = await ajouterDepense({
      date: '2026-03-10',
      description: 'Cadeau partage inegalement',
      montant: 10000,
      payePar: 'thomas',
      type: 'courante',
      mode: 'personnalise',
      partsPersonnalisees: { thomas: 7000, liz: 3000 },
    })
    expect(d.parts).toEqual({ thomas: 7000, liz: 3000 })
  })

  it('refuse des parts personnalisees qui ne somment pas au montant', async () => {
    await deuxVersions()
    await expect(
      ajouterDepense({
        date: '2026-03-10',
        description: 'Parts incoherentes',
        montant: 10000,
        payePar: 'thomas',
        type: 'courante',
        mode: 'personnalise',
        partsPersonnalisees: { thomas: 7000, liz: 4000 },
      }),
    ).rejects.toThrow(/somme des parts/i)
  })
})

describe('LE CANARI, vu par la facade', () => {
  it('rend exactement 114 580 centimes apres relecture depuis Postgres', async () => {
    // Le canari du plan 1 tourne sur des objets en memoire. Celui-ci fait
    // l'aller-retour complet par la base : si un mapper inverse deux colonnes,
    // le solde bouge et ce test tombe. Ne l'ajuste pas — trouve ce qui a casse.
    const idsReels = new Map<string, string>()
    for (const v of VERSIONS_INITIALES) {
      const { rows } = await db.execute<{ id: string }>(sql`
        select * from creer_version_config(
          ${v.libelle}, ${v.dateDebut}::date, ${v.salaireNetThomas}, ${v.salaireNetLiz},
          ${JSON.stringify(v.chargesCommunes)}::jsonb,
          ${JSON.stringify(v.chargesPersoThomas)}::jsonb,
          ${JSON.stringify(v.chargesPersoLiz)}::jsonb
        )
      `)
      const ligne = rows[0]
      if (!ligne) throw new Error('creer_version_config n a rien renvoye')
      idsReels.set(v.id, ligne.id)
    }

    const csv = await import('node:fs').then((fs) =>
      fs.readFileSync(
        new URL('../../../docs/data/sheet-export-2026-07-12/depenses.csv', import.meta.url),
        'utf-8',
      ),
    )

    const depenses = importerDepenses(csv, VERSIONS_INITIALES)
    await db.insert(depense).values(
      depenses.map((d) => {
        const versionId = idsReels.get(d.versionConfigId)
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

    const r = resumer(await listerDepenses())

    expect(r.soldeThomas).toBe(114580)
    expect(formaterEuros(r.soldeThomas).replace(/[\xa0 ]/g, ' ')).toBe('1 145,80 €')
    expect(phraseSynthese(r).replace(/[\xa0 ]/g, ' ')).toBe('Liz doit 1 145,80 € à Thomas')
  })
})
