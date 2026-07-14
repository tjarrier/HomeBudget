import { describe, expect, it } from 'vitest'
import { CONFIRMATION_DISTANT, assertBaseEffacable } from '../src/garde-base.js'

const LOCAL = 'postgresql://homebudget:homebudget@127.0.0.1:5433/homebudget'
const PROD = 'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres'

describe('assertBaseEffacable', () => {
  it('laisse passer 127.0.0.1', () => {
    expect(() => assertBaseEffacable(LOCAL, undefined)).not.toThrow()
  })

  it('laisse passer localhost', () => {
    expect(() =>
      assertBaseEffacable('postgresql://u:p@localhost:5433/homebudget', undefined),
    ).not.toThrow()
  })

  // Le scenario qui coute cher : DATABASE_URL exportee sur la prod, un `db:seed`
  // par reflexe, et le TRUNCATE passe SOUS le trigger append-only.
  it('refuse un hote distant', () => {
    expect(() => assertBaseEffacable(PROD, undefined)).toThrow(/distante/i)
  })

  it('nomme l hote refuse, pour qu on voie ce qu on a failli effacer', () => {
    expect(() => assertBaseEffacable(PROD, undefined)).toThrow(/db\.abcdefgh\.supabase\.co/)
  })

  it('autorise un hote distant si la confirmation explicite est donnee', () => {
    expect(() => assertBaseEffacable(PROD, CONFIRMATION_DISTANT)).not.toThrow()
  })

  it('refuse une confirmation approximative', () => {
    expect(() => assertBaseEffacable(PROD, 'oui')).toThrow(/distante/i)
  })

  // Une URL illisible ne doit pas etre traitee comme locale par defaut.
  it('refuse une URL qu il ne sait pas parser', () => {
    expect(() => assertBaseEffacable('pas-une-url', undefined)).toThrow(/illisible/i)
  })
})
