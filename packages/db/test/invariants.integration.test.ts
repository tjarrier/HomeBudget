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

  // Le CHECK ne portait que sur la SOMME (`salaires_cumules_non_nuls`) : un salaire
  // individuel negatif passait tant que l'autre compensait. Le domaine, lui, refuse
  // (`ratioThomas` jette) — la base laissait donc ecrire une config qui fait planter
  // le domaine a la LECTURE.
  it('refuse un salaire individuel negatif, meme si la somme reste positive', async () => {
    await expect(
      db.execute(sql`
        select * from creer_version_config(
          'Piege', '2025-07-01'::date, -100000, 300000,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
        )
      `),
    ).rejects.toThrow(/salaires_positifs/i)
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

/**
 * I2 : « les parts sont figees d'apres la config en vigueur A LA DATE de la depense ».
 * La FK seule ne dit rien de la DATE : elle laisse rattacher une depense a n'importe
 * quelle version. C'est le bug du Sheet qui rentre par la porte de derriere — une
 * Server Action qui attrape la config *courante* au lieu de celle *a la date* produit
 * des parts au mauvais ratio, et le CHECK parts_somment_au_montant est satisfait
 * (elles somment, elles sont juste fausses).
 */
describe('I2 — une depense appartient a la version qui couvre sa date', () => {
  function ligne(date: string, versionId: string) {
    return {
      date,
      description: 'test',
      montantCents: 10000,
      payePar: 'thomas' as const,
      type: 'courante' as const,
      modeRepartition: 'moitie' as const,
      partThomasCents: 5000,
      partLizCents: 5000,
      versionConfigId: versionId,
    }
  }

  it('accepte une depense dans la plage de sa version', async () => {
    const v1 = await creerVersion('v1', '2025-07-01')
    await expect(db.insert(depense).values(ligne('2025-08-05', v1.id))).resolves.toBeDefined()
  })

  it('accepte une depense le PREMIER jour de sa version (borne incluse)', async () => {
    const v1 = await creerVersion('v1', '2025-07-01')
    await expect(db.insert(depense).values(ligne('2025-07-01', v1.id))).resolves.toBeDefined()
  })

  it('accepte une depense le DERNIER jour de sa version (borne incluse)', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01') // cloture v1 au 2026-06-30
    const [v1] = await db.select().from(versionConfig).where(sql`libelle = 'v1'`)
    if (!v1) throw new Error('v1 introuvable')

    await expect(db.insert(depense).values(ligne('2026-06-30', v1.id))).resolves.toBeDefined()
  })

  it('refuse une depense APRES la fin de sa version', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01')
    const [v1] = await db.select().from(versionConfig).where(sql`libelle = 'v1'`)
    if (!v1) throw new Error('v1 introuvable')

    // Le cas exact de la Server Action qui prend la version courante par erreur.
    await expect(db.insert(depense).values(ligne('2026-08-01', v1.id))).rejects.toThrow(
      /ne couvre pas/i,
    )
  })

  it('refuse une depense AVANT le debut de sa version', async () => {
    const v1 = await creerVersion('v1', '2025-07-01')

    // La depense antidatee : la version courante ne la couvre pas.
    await expect(db.insert(depense).values(ligne('2025-06-30', v1.id))).rejects.toThrow(
      /ne couvre pas/i,
    )
  })

  it('refuse aussi de DEPLACER une depense hors de la plage de sa version', async () => {
    const v1 = await creerVersion('v1', '2025-07-01')
    await db.insert(depense).values(ligne('2025-08-05', v1.id))

    // Un INSERT valide suivi d'un UPDATE de la date contournerait un trigger
    // pose sur le seul INSERT.
    await expect(
      db.execute(sql`update depense set date = '2020-01-01' where description = 'test'`),
    ).rejects.toThrow(/ne couvre pas/i)
  })
})

/**
 * Le piege qui coute de l'argent, dans sa variante SQL : rien ne couplait `type` et
 * `mode_repartition`. Un remboursement de 400 € reparti « moitie » ne deplace la dette
 * que de 200 €.
 */
describe('couplage type / mode de repartition', () => {
  it('accepte un transfert reparti en transfert', async () => {
    const v1 = await creerVersion('v1', '2025-07-01')
    await expect(
      db.insert(depense).values({
        date: '2025-08-05',
        description: 'Virement de Liz',
        montantCents: 40000,
        payePar: 'liz',
        type: 'transfert',
        modeRepartition: 'transfert',
        partThomasCents: 40000,
        partLizCents: 0,
        versionConfigId: v1.id,
      }),
    ).resolves.toBeDefined()
  })

  it('refuse un transfert reparti en moitie', async () => {
    const v1 = await creerVersion('v1', '2025-07-01')
    await expect(
      db.insert(depense).values({
        date: '2025-08-05',
        description: 'Virement de Liz',
        montantCents: 40000,
        payePar: 'liz',
        type: 'transfert',
        modeRepartition: 'moitie', // la dette ne bougerait que de 200 €
        partThomasCents: 20000,
        partLizCents: 20000,
        versionConfigId: v1.id,
      }),
    ).rejects.toThrow(/transfert_couple_type_et_mode/i)
  })

  it('refuse une depense courante repartie en transfert', async () => {
    const v1 = await creerVersion('v1', '2025-07-01')
    await expect(
      db.insert(depense).values({
        date: '2025-08-05',
        description: 'Courses',
        montantCents: 10000,
        payePar: 'thomas',
        type: 'courante', // comptee dans totalDepenses...
        modeRepartition: 'transfert', // ...mais repartie 0 / 100
        partThomasCents: 0,
        partLizCents: 10000,
        versionConfigId: v1.id,
      }),
    ).rejects.toThrow(/transfert_couple_type_et_mode/i)
  })
})

/**
 * I1 (suite) : une version OUVERTE restait librement mutable, meme quand des depenses
 * la referencaient deja. Les parts figees ne bougeaient pas (I2 tenait), mais l'audit
 * « part = f(version, montant) » n'etait plus reproductible : deux depenses pointant la
 * meme version pouvaient avoir ete figees avec deux ratios differents.
 */
describe('I1 — une version qui porte des depenses est verrouillee', () => {
  async function versionAvecDepense() {
    const v1 = await creerVersion('v1', '2025-07-01')
    await db.insert(depense).values({
      date: '2025-08-05',
      description: 'Courses',
      montantCents: 10000,
      payePar: 'thomas',
      type: 'courante',
      modeRepartition: 'moitie',
      partThomasCents: 5000,
      partLizCents: 5000,
      versionConfigId: v1.id,
    })
    return v1
  }

  it('refuse de changer un salaire quand des depenses sont deja figees dessus', async () => {
    await versionAvecDepense()

    await expect(
      db.execute(
        sql`update version_config set salaire_net_thomas_cents = 999999 where libelle = 'v1'`,
      ),
    ).rejects.toThrow(/depense/i)
  })

  it('refuse de deplacer la date_debut d une version qui porte des depenses', async () => {
    await versionAvecDepense()

    // Ce UPDATE creait en prime un TROU de calendrier, que l'EXCLUDE ne voit pas :
    // il ne detecte que les chevauchements.
    await expect(
      db.execute(sql`update version_config set date_debut = '2027-01-01' where libelle = 'v1'`),
    ).rejects.toThrow(/depense/i)
  })

  it('autorise quand meme la CLOTURE d une version qui porte des depenses', async () => {
    // Le verrou ne doit pas casser le mecanisme normal : une revision de loyer
    // cloture forcement une version qui porte deja des depenses.
    await versionAvecDepense()

    await expect(creerVersion('v2', '2026-07-01')).resolves.toBeDefined()

    const [v1] = await db.select().from(versionConfig).where(sql`libelle = 'v1'`)
    expect(v1?.dateFin).toBe('2026-06-30')
  })

  it('laisse mutable une version ouverte qui ne porte AUCUNE depense', async () => {
    // Pas de sur-correction : tant que rien n'est fige dessus, corriger une coquille
    // de saisie reste legitime.
    await creerVersion('v1', '2025-07-01')

    await expect(
      db.execute(
        sql`update version_config set salaire_net_thomas_cents = 340000 where libelle = 'v1'`,
      ),
    ).resolves.toBeDefined()
  })
})
