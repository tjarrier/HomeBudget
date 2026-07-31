import { compte, db, session, utilisateur, verification } from '@homebudget/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { avantCreationUtilisateur } from './allowlist.js'
import { origineAuth, originesDeConfiance } from './origine.js'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user: utilisateur, session, account: compte, verification },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: origineAuth(),
  trustedOrigins: originesDeConfiance(),
  // Aucune inscription par mot de passe : la seule porte est Google, filtree
  // par l'allowlist. Un test verrouille cette ligne.
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  user: {
    additionalFields: {
      personne: { type: 'string', required: false, input: false },
    },
  },
  databaseHooks: {
    user: { create: { before: avantCreationUtilisateur } },
  },
})

export type Session = typeof auth.$Infer.Session
