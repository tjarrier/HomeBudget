import { formaterEuros, genererChargeFixe, phraseSynthese, resumer } from '@homebudget/domain'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from '../src/client.js'
import { ajouterDepense, creerVersion, genererChargeFixeDuMois } from '../src/ecriture.js'
import { VERSIONS_INITIALES, importerDepenses } from '../src/import-sheet.js'
import { listerDepenses, listerVersions } from '../src/lecture.js'
import { depense } from '../src/schema.js'

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  await db.execute(sql`truncate depense, version_config cascade`)
})

async function creerVersionSql(libelle: string, dateDebut: string): Promise<{ id: string }> {
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
    await creerVersionSql('v1', '2025-07-01')
    await creerVersionSql('v2', '2026-07-01')

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
    const v = await creerVersionSql('v1', '2026-07-01')
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

  /**
   * La borne HAUTE de la fenetre plausible (issue #29). Elle ne peut pas etre
   * ecrite en dur : le test doit rester vrai dans deux ans. On la construit
   * relativement a l'horloge — le 15 janvier de l'annee N+2 est toujours
   * au-dela d'un an apres aujourd'hui, quel que soit le jour de l'annee.
   */
  function dansDeuxAns(): string {
    return `${new Date().getUTCFullYear() + 2}-01-15`
  }

  it('refuse une depense datee a plus d un an, avant toute ecriture', async () => {
    await deuxVersions()

    await expect(
      ajouterDepense({
        date: dansDeuxAns(),
        description: 'Coquille d annee',
        montant: 5000,
        payePar: 'thomas',
        type: 'courante',
        mode: 'moitie',
      }),
    ).rejects.toThrow(/trop lointaine/i)

    // « Avant d'atteindre la base » : la garde n'a pas de valeur si la ligne est
    // ecrite puis l'erreur levee. La version courante etant ouverte, rien
    // d'autre n'aurait refuse cette date.
    const restantes = await listerDepenses()
    expect(restantes).toEqual([])
  })

  it('laisse passer une depense datee dans les mois a venir', async () => {
    // Le pendant du test precedent : interdire la sur-correction. Une depense
    // legitimement postdatee (prelevement annonce) doit toujours s ecrire.
    await deuxVersions()
    const dansUnMois = new Date()
    dansUnMois.setUTCDate(dansUnMois.getUTCDate() + 30)

    const d = await ajouterDepense({
      date: dansUnMois.toISOString().slice(0, 10),
      description: 'Prelevement annonce',
      montant: 5000,
      payePar: 'thomas',
      type: 'courante',
      mode: 'moitie',
    })

    expect(d.parts.thomas + d.parts.liz).toBe(d.montant)
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

describe('creerVersion', () => {
  it('cloture la precedente LA VEILLE de la nouvelle prise d effet', async () => {
    await creerVersion({
      libelle: 'Config initiale',
      dateDebut: '2025-07-01',
      salaireNetThomas: 330000,
      salaireNetLiz: 180000,
      chargesCommunes: [{ libelle: 'Loyer', montant: 78500 }],
      chargesPersoThomas: [],
      chargesPersoLiz: [],
    })

    const nouvelle = await creerVersion({
      libelle: 'Revision de loyer',
      dateDebut: '2026-07-01',
      salaireNetThomas: 340000,
      salaireNetLiz: 190000,
      chargesCommunes: [{ libelle: 'Loyer', montant: 79100 }],
      chargesPersoThomas: [],
      chargesPersoLiz: [],
    })

    expect(nouvelle.dateFin).toBeNull()
    expect(nouvelle.chargesCommunes).toEqual([{ libelle: 'Loyer', montant: 79100 }])

    const versions = await listerVersions()
    expect(versions).toHaveLength(2)
    // La VEILLE : le 30 juin, pas le 1er juillet. Un chevauchement d'un jour
    // ferait echouer l'EXCLUDE ; un trou d'un jour rendrait une depense infigeable.
    expect(versions[0]?.dateFin).toBe('2026-06-30')
    expect(versions[1]?.dateDebut).toBe('2026-07-01')
  })

  it("n'altere aucune part deja figee", async () => {
    // La raison d'etre du projet, exercee de bout en bout : une revision de
    // config ne doit RIEN changer a l'historique.
    await creerVersion({
      libelle: 'v1',
      dateDebut: '2025-01-01',
      salaireNetThomas: 300000,
      salaireNetLiz: 100000,
      chargesCommunes: [],
      chargesPersoThomas: [],
      chargesPersoLiz: [],
    })
    const avant = await ajouterDepense({
      date: '2025-06-15',
      description: 'Course',
      montant: 10000,
      payePar: 'thomas',
      type: 'charge_fixe',
      mode: 'prorata',
    })
    expect(avant.parts).toEqual({ thomas: 7500, liz: 2500 })

    await creerVersion({
      libelle: 'v2 — ratio inverse',
      dateDebut: '2026-01-01',
      salaireNetThomas: 100000,
      salaireNetLiz: 300000,
      chargesCommunes: [],
      chargesPersoThomas: [],
      chargesPersoLiz: [],
    })

    const apres = await listerDepenses()
    expect(apres[0]?.parts).toEqual({ thomas: 7500, liz: 2500 })
    expect(apres[0]?.versionConfigId).toBe(avant.versionConfigId)
  })

  it('refuse une date de prise d effet anterieure ou egale a la version courante', async () => {
    await creerVersion({
      libelle: 'v1',
      dateDebut: '2026-01-01',
      salaireNetThomas: 300000,
      salaireNetLiz: 100000,
      chargesCommunes: [],
      chargesPersoThomas: [],
      chargesPersoLiz: [],
    })
    await expect(
      creerVersion({
        libelle: 'v0 retroactive',
        dateDebut: '2025-06-01',
        salaireNetThomas: 300000,
        salaireNetLiz: 100000,
        chargesCommunes: [],
        chargesPersoThomas: [],
        chargesPersoLiz: [],
      }),
    ).rejects.toThrow(/anterieure ou egale/i)
  })
})

/**
 * L'usage principal du versioning, et le bug d'origine du Sheet : une revision
 * de loyer AU MILIEU d'un mois. Tous les tests ci-dessus revisent au 1er ; le
 * 15 est le seul cas ou le mois est coupe en deux, donc le seul ou la date de
 * la charge generee change de version.
 *
 * Le domaine seul ne peut pas prouver ce qui compte ici : que Postgres ACCEPTE
 * cette date. C'est le trigger `depense_dans_sa_version` (migration 0004) qui
 * tranche, et il ne tourne qu'en base.
 *
 * Ratios volontairement INVERSES entre les deux versions (0,75 puis 0,25) : une
 * charge figee par la mauvaise version somme toujours au bon montant, donc seul
 * un ratio different la trahit.
 */
const V1 = {
  libelle: 'v1 — loyer 785',
  dateDebut: '2026-01-01',
  salaireNetThomas: 300000,
  salaireNetLiz: 100000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 78500 },
    { libelle: 'Divers', montant: 10000 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}
const V2 = {
  libelle: 'v2 — loyer 791, au 15 juillet',
  dateDebut: '2026-07-15',
  salaireNetThomas: 100000,
  salaireNetLiz: 300000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 79100 },
    { libelle: 'Divers', montant: 10000 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

describe('LE MOIS DE BASCULE — revision au 15 du mois', () => {
  /** Genere la charge du mois puis l'ECRIT — le brouillon ne prouve rien seul. */
  async function genererEtEcrire(mois: string) {
    const genere = genererChargeFixe(await listerVersions(), mois, 'thomas')
    const ecrite = await ajouterDepense({
      date: genere.date,
      description: genere.description,
      montant: genere.montant,
      payePar: genere.payePar,
      type: genere.type,
      mode: genere.mode,
    })
    // `ajouterDepense` RE-RESOUT la version depuis la seule date. Si le domaine
    // datait juillet du 01/07 en portant le montant de v2, l'ecriture le figerait
    // sous v1 et ces deux egalites tomberaient. C'est tout l'objet du test.
    expect(ecrite.parts).toEqual(genere.parts)
    expect(ecrite.versionConfigId).toBe(genere.versionConfigId)
    return { genere, ecrite }
  }

  it('prend le nouveau montant des le mois de bascule, et le passe ne bouge pas', async () => {
    const v1 = await creerVersion(V1)

    const mai = await genererEtEcrire('2026-05')
    const juin = await genererEtEcrire('2026-06')
    expect(mai.ecrite.date).toBe('2026-05-01')
    expect(juin.ecrite.montant).toBe(88500)
    expect(juin.ecrite.parts).toEqual({ thomas: 66375, liz: 22125 }) // ratio 0,75

    // La revision arrive. v1 porte deja deux charges : seule sa CLOTURE reste
    // permise (invariant I1), et c'est exactement ce que fait creerVersion.
    const v2 = await creerVersion(V2)
    expect((await listerVersions())[0]?.dateFin).toBe('2026-07-14')

    // Cote GAUCHE de la bascule : rien de l'historique n'a bouge.
    const apres = await listerDepenses()
    // `listerDepenses` rend la plus recente d'abord.
    expect(apres.map((d) => [d.date, d.montant, d.parts])).toEqual([
      ['2026-06-01', 88500, { thomas: 66375, liz: 22125 }],
      ['2026-05-01', 88500, { thomas: 66375, liz: 22125 }],
    ])
    expect(apres.every((d) => d.versionConfigId === v1.id)).toBe(true)

    // Cote DROIT : juillet, coupe en deux, produit UNE ligne datee du 15 —
    // le premier jour ou v2 s'applique — au nouveau montant et au nouveau ratio.
    const juillet = await genererEtEcrire('2026-07')
    expect(juillet.ecrite.date).toBe('2026-07-15')
    expect(juillet.ecrite.montant).toBe(89100)
    expect(juillet.ecrite.parts).toEqual({ thomas: 22275, liz: 66825 }) // ratio 0,25
    expect(juillet.ecrite.versionConfigId).toBe(v2.id)

    // Le mois suivant repart du 1er : le decalage ne survit pas a la bascule.
    const aout = await genererEtEcrire('2026-08')
    expect(aout.ecrite.date).toBe('2026-08-01')
    expect(aout.ecrite.montant).toBe(89100)
    expect(aout.ecrite.versionConfigId).toBe(v2.id)
  })

  it('la date decide de la version : datee du 01/07, la meme charge est figee par v1', async () => {
    // Le piege que la decision de #22 evite, exerce plutot qu'affirme en
    // commentaire. Les DEUX dates passent le trigger — c'est ce qui rend
    // l'erreur silencieuse. Seules les parts different, et a l'envers.
    const v1 = await creerVersion(V1)
    await creerVersion(V2)

    const mauvaise = await ajouterDepense({
      date: '2026-07-01', // avant la prise d'effet : encore dans v1
      description: 'Loyer + charges juillet 2026',
      montant: 89100, // ... mais au montant de v2
      payePar: 'thomas',
      type: 'charge_fixe',
      mode: 'prorata',
    })

    expect(mauvaise.versionConfigId).toBe(v1.id)
    // Le miroir exact des parts attendues : montant neuf, ratio ancien.
    expect(mauvaise.parts).toEqual({ thomas: 66825, liz: 22275 })
  })
})

describe('genererChargeFixeDuMois — idempotence', () => {
  it('ecrit la charge du mois, marquee genereAuto', async () => {
    await creerVersion(V1)

    const { depense: d, creee } = await genererChargeFixeDuMois('2026-05', 'thomas')

    expect(creee).toBe(true)
    expect(d.genereAuto).toBe(true) // la seule ecriture du projet qui le pose
    expect(d.date).toBe('2026-05-01')
    expect(d.montant).toBe(88500)
    expect(d.parts).toEqual({ thomas: 66375, liz: 22125 })
    expect(d.type).toBe('charge_fixe')
  })

  it('declenchee deux fois sur le meme mois, ne double pas les charges', async () => {
    await creerVersion(V1)

    const premier = await genererChargeFixeDuMois('2026-05', 'thomas')
    const second = await genererChargeFixeDuMois('2026-05', 'thomas')

    expect(second.creee).toBe(false)
    // La MEME ligne, pas une copie : l'id vient de la base.
    expect(second.depense.id).toBe(premier.depense.id)

    const toutes = await listerDepenses()
    expect(toutes).toHaveLength(1)
    // Le critere de l'enonce : le solde ne bouge pas d'un centime.
    expect(resumer(toutes).soldeThomas).toBe(resumer([premier.depense]).soldeThomas)
  })

  it('cinq declenchements de suite laissent une seule ligne', async () => {
    await creerVersion(V1)

    for (let i = 0; i < 5; i++) await genererChargeFixeDuMois('2026-05', 'thomas')

    expect(await listerDepenses()).toHaveLength(1)
  })

  it('sur un mois de bascule, la seconde generation n ajoute pas de ligne au 1er', async () => {
    // Le piege propre a l'index : la charge de juillet est datee du 15, pas du
    // 1er. Une unicite posee sur la DATE laisserait passer une seconde ligne des
    // que la date changerait. La cle est le mois.
    await creerVersion(V1)
    await creerVersion(V2)

    const premier = await genererChargeFixeDuMois('2026-07', 'thomas')
    expect(premier.depense.date).toBe('2026-07-15')

    const second = await genererChargeFixeDuMois('2026-07', 'thomas')
    expect(second.creee).toBe(false)
    expect(second.depense.id).toBe(premier.depense.id)
    expect(await listerDepenses()).toHaveLength(1)
  })

  it('genere des mois DIFFERENTS sans se bloquer elle-meme', async () => {
    await creerVersion(V1)

    await genererChargeFixeDuMois('2026-04', 'thomas')
    await genererChargeFixeDuMois('2026-05', 'thomas')
    await genererChargeFixeDuMois('2026-06', 'thomas')

    expect((await listerDepenses()).map((d) => d.date)).toEqual([
      '2026-06-01',
      '2026-05-01',
      '2026-04-01',
    ])
  })

  it('ne gene pas une charge fixe saisie A LA MAIN le meme mois', async () => {
    // L'index est PARTIEL. Une regularisation d'eau saisie en mai reste possible,
    // sans quoi la generation confisquerait le type `charge_fixe` pour tout le mois.
    await creerVersion(V1)
    await genererChargeFixeDuMois('2026-05', 'thomas')

    await ajouterDepense({
      date: '2026-05-20',
      description: 'Regularisation eau',
      montant: 4200,
      payePar: 'liz',
      type: 'charge_fixe',
      mode: 'prorata',
    })

    const toutes = await listerDepenses()
    expect(toutes).toHaveLength(2)
    expect(toutes.filter((d) => d.genereAuto)).toHaveLength(1)
  })

  it('refuse un mois trop lointain, avant toute ecriture', async () => {
    // La coquille d'annee de #29 : « 2036-07 » au lieu de « 2026-07 ». La version
    // courante est ouverte, donc le domaine generait sans broncher.
    await creerVersion(V1)

    await expect(genererChargeFixeDuMois('2036-07', 'thomas')).rejects.toThrow(/trop lointaine/i)
    expect(await listerDepenses()).toHaveLength(0)
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
