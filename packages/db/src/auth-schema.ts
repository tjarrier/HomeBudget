import type { Personne } from '@homebudget/domain'
import { sql } from 'drizzle-orm'
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const utilisateur = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    // Le pont identite Google -> personne du budget. Pose une seule fois, par le
    // hook d'allowlist, a la creation du compte. Nullable en base parce que Better
    // Auth insere la ligne : c'est le hook `before` qui garantit qu'elle est remplie.
    personne: text('personne').$type<Personne>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // $type<Personne>() n'est qu'une annotation TypeScript : sans ce CHECK, la
    // colonne est du text libre en base. La base doit refuser physiquement toute
    // valeur hors thomas/liz, tout en restant nullable (voir commentaire ci-dessus).
    check('personne_valide', sql`${t.personne} is null or ${t.personne} in ('thomas', 'liz')`),
  ],
)

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => utilisateur.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const compte = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => utilisateur.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
