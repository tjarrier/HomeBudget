import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from '../src/client.js'
import { depense, versionConfig } from '../src/schema.js'

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  await db.execute(sql`truncate depense, version_config cascade`)
})

async function creerVersion(libelle: string, dateDebut: string): Promise<{ id: string }> {
  // Passage par la fonction SQL : c'est elle qui cloture la precedente, en
  // transaction. On ne contourne pas le mecanisme append-only, meme en test.
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

describe('invariants portes par la base', () => {
  it('creer une version cloture la precedente la VEILLE', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01')

    const versions = await db.select().from(versionConfig).orderBy(versionConfig.dateDebut)

    // Drizzle rend les dates en chaines ISO : aucune conversion, aucun fuseau.
    expect(versions[0]?.dateFin).toBe('2026-06-30')
    expect(versions[1]?.dateFin).toBeNull()
  })

  it('refuse de modifier une version close (append-only)', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01')

    await expect(
      db.execute(
        sql`update version_config set salaire_net_thomas_cents = 999999 where libelle = 'v1'`,
      ),
    ).rejects.toThrow(/append-only/i)
  })

  it('autorise la cloture d une version ouverte', async () => {
    // Le trigger ne doit pas bloquer le mecanisme normal : poser une date_fin sur
    // une version encore ouverte est exactement ce que fait une revision de loyer.
    await creerVersion('v1', '2025-07-01')
    await expect(creerVersion('v2', '2026-07-01')).resolves.toBeDefined()
  })

  it('refuse de supprimer une version close (append-only)', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01')

    await expect(db.execute(sql`delete from version_config where libelle = 'v1'`)).rejects.toThrow(
      /append-only/i,
    )
  })

  it('autorise la suppression d une version ouverte', async () => {
    // Le trigger ne doit pas bloquer la suppression d une version qui n a
    // jamais ete cloturee : pas de sur-correction.
    await creerVersion('v1', '2025-07-01')

    await expect(
      db.execute(sql`delete from version_config where libelle = 'v1'`),
    ).resolves.toBeDefined()

    const versions = await db.select().from(versionConfig)
    expect(versions).toHaveLength(0)
  })

  it('refuse deux versions qui se chevauchent', async () => {
    await creerVersion('v1', '2025-07-01')

    await expect(
      db.insert(versionConfig).values({
        libelle: 'chevauchante',
        dateDebut: '2025-08-01',
        dateFin: null,
        salaireNetThomasCents: 330000,
        salaireNetLizCents: 180000,
      }),
    ).rejects.toThrow(/versions_sans_chevauchement|exclusion/i)
  })

  it('refuse une depense dont les parts ne somment pas au montant', async () => {
    const version = await creerVersion('v1', '2025-07-01')

    await expect(
      db.insert(depense).values({
        date: '2025-08-05',
        description: 'incoherente',
        montantCents: 10000,
        payePar: 'thomas',
        type: 'courante',
        modeRepartition: 'personnalise',
        partThomasCents: 4000,
        partLizCents: 5000, // 4000 + 5000 = 9000, pas 10000
        versionConfigId: version.id,
      }),
    ).rejects.toThrow(/parts_somment_au_montant/i)
  })

  it('refuse une depense sans version de config', async () => {
    await expect(
      db.insert(depense).values({
        date: '2025-08-05',
        description: 'orpheline',
        montantCents: 10000,
        payePar: 'thomas',
        type: 'courante',
        modeRepartition: 'moitie',
        partThomasCents: 5000,
        partLizCents: 5000,
        versionConfigId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/foreign key|violates/i)
  })
})
