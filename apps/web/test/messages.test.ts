import { describe, expect, it } from 'vitest'
import { messageConnexion } from '../app/(auth)/login/messages.js'
import { CODE_COMPTE_INCOMPLET, CODE_REFUS } from '../lib/codes-connexion.js'

describe('messageConnexion', () => {
  it('donne le message de refus pour une adresse non autorisee', () => {
    expect(messageConnexion(CODE_REFUS)).toMatch(/n'est pas autorisée/i)
  })

  it('donne un message pour un compte incomplet', () => {
    expect(messageConnexion(CODE_COMPTE_INCOMPLET)).toMatch(/pas tout à fait prêt/i)
  })

  it('donne un message generique pour un code inconnu', () => {
    // Google renvoie `access_denied` si l'utilisateur annule cote consentement,
    // et d'autres codes OAuth existent : on ne les enumere pas, on rassure.
    expect(messageConnexion('access_denied')).toMatch(/n'a pas abouti/i)
  })

  it('ne rend aucun message quand il n y a pas de code', () => {
    expect(messageConnexion(undefined)).toBeNull()
    expect(messageConnexion('')).toBeNull()
  })
})
