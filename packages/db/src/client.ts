import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schemaAuth from './auth-schema.js'
import * as schemaBudget from './schema.js'

const DEFAUT_LOCAL = 'postgresql://homebudget:homebudget@127.0.0.1:5433/homebudget'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAUT_LOCAL,
})

const schema = { ...schemaBudget, ...schemaAuth }

export const db = drizzle(pool, { schema })
export { schema }
