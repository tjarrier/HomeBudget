import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const personneEnum = pgEnum('personne', ['thomas', 'liz'])
export const typeDepenseEnum = pgEnum('type_depense', ['charge_fixe', 'courante', 'transfert'])
export const modeRepartitionEnum = pgEnum('mode_repartition', [
  'prorata',
  'moitie',
  'personnalise',
  'transfert',
])

interface ChargeJson {
  libelle: string
  montant: number
}

/**
 * Configuration versionnee : effective-dated, append-only (invariant I1).
 *
 * `date_debut` et `date_fin` sont rendus en CHAINES ISO par Drizzle, pas en objets
 * `Date` : c'est ce qu'attend le domaine, et ca elimine tout bug de fuseau horaire.
 */
export const versionConfig = pgTable(
  'version_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    libelle: text('libelle').notNull(),
    dateDebut: date('date_debut').notNull(),
    dateFin: date('date_fin'), // null = version en cours
    salaireNetThomasCents: integer('salaire_net_thomas_cents').notNull(),
    salaireNetLizCents: integer('salaire_net_liz_cents').notNull(),
    chargesCommunes: jsonb('charges_communes').$type<ChargeJson[]>().notNull().default([]),
    chargesPersoThomas: jsonb('charges_perso_thomas').$type<ChargeJson[]>().notNull().default([]),
    chargesPersoLiz: jsonb('charges_perso_liz').$type<ChargeJson[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('libelle_non_vide', sql`length(trim(${t.libelle})) > 0`),
    // Le prorata est indefini si personne ne gagne rien.
    check(
      'salaires_cumules_non_nuls',
      sql`${t.salaireNetThomasCents} + ${t.salaireNetLizCents} > 0`,
    ),
    // Le CHECK ci-dessus ne portait que sur la SOMME : un salaire individuel negatif
    // passait des lors que l'autre compensait. Le domaine, lui, refuse (`ratioThomas`
    // jette) — la base laissait donc ecrire une config qui fait planter le domaine A
    // LA LECTURE, et un ratio hors de [0,1] n'a aucun sens.
    check(
      'salaires_positifs',
      sql`${t.salaireNetThomasCents} >= 0 and ${t.salaireNetLizCents} >= 0`,
    ),
    check('periode_coherente', sql`${t.dateFin} is null or ${t.dateFin} >= ${t.dateDebut}`),
  ],
)

/** Depenses : les parts sont FIGEES a l'ecriture (invariant I2). */
export const depense = pgTable(
  'depense',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date').notNull(),
    description: text('description').notNull(),
    montantCents: integer('montant_cents').notNull(),
    payePar: personneEnum('paye_par').notNull(),
    type: typeDepenseEnum('type').notNull(),
    modeRepartition: modeRepartitionEnum('mode_repartition').notNull(),
    partThomasCents: integer('part_thomas_cents').notNull(),
    partLizCents: integer('part_liz_cents').notNull(),
    versionConfigId: uuid('version_config_id')
      .notNull()
      .references(() => versionConfig.id, { onDelete: 'restrict' }),
    genereAuto: boolean('genere_auto').notNull().default(false),
    commentaire: text('commentaire'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('description_non_vide', sql`length(trim(${t.description})) > 0`),
    check('montant_positif', sql`${t.montantCents} > 0`),
    // L'invariant qui rend le solde exact. La base refuse physiquement de l'ecrire faux.
    check(
      'parts_somment_au_montant',
      sql`${t.partThomasCents} + ${t.partLizCents} = ${t.montantCents}`,
    ),
    // `type` et `mode` etaient libres l'un de l'autre, et c'est le piege qui coute de
    // l'argent : un `type='transfert'` reparti en `moitie` ne deplace la dette que de
    // la MOITIE du remboursement. Une equivalence, pas une implication : ni un
    // transfert reparti autrement, ni une depense repartie « en transfert ».
    check(
      'transfert_couple_type_et_mode',
      sql`(${t.type} = 'transfert') = (${t.modeRepartition} = 'transfert')`,
    ),
    index('depense_date_idx').on(t.date.desc()),
    index('depense_version_idx').on(t.versionConfigId),
  ],
)
