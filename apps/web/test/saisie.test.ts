import { describe, expect, it } from 'vitest'
import { type SaisieBrute, normaliser } from '../lib/saisie.js'

function saisie(surcharges: Partial<SaisieBrute>): SaisieBrute {
  return {
    date: '2026-07-19',
    description: 'Courses',
    montant: '400,00',
    payePar: 'liz',
    type: 'courante',
    mode: 'moitie',
    ...surcharges,
  }
}

describe('normaliser — coherence de type et mode', () => {
  // `type` et `mode` sont deux <select> independants dans le formulaire, et
  // `normaliser` validait chaque champ contre son union SANS jamais valider leur
  // combinaison. Le domaine ne rattrape pas : `calculerParts` branche sur `mode`,
  // `resumer` branche sur `type`. Or les parts sont figees POUR TOUJOURS a
  // l'ecriture (regle 4) — une combinaison incoherente ne se repare pas.
  it.each([['moitie'], ['prorata'], ['personnalise']])(
    "refuse type='transfert' avec mode='%s'",
    (mode) => {
      // Le cas qui coute de l'argent : Liz verse 400 € a Thomas, l'app partage
      // 200/200, sa dette ne baisse que de 200 €. C'est le piege de CLAUDE.md
      // atteint par un autre chemin que l'inversion de signe.
      expect(() =>
        normaliser(saisie({ type: 'transfert', mode, partThomas: '200,00', partLiz: '200,00' })),
      ).toThrow(/transfert/i)
    },
  )

  it.each([['courante'], ['charge_fixe']])("refuse mode='transfert' avec type='%s'", (type) => {
    // Le sens inverse est tout aussi faux : le mode `transfert` affecte 100 %
    // du montant au NON-payeur, ce qui n'a aucun sens pour une depense reelle.
    expect(() => normaliser(saisie({ type, mode: 'transfert' }))).toThrow(/transfert/i)
  })

  it('accepte la seule combinaison de transfert legitime', () => {
    const s = normaliser(saisie({ type: 'transfert', mode: 'transfert' }))
    expect(s.type).toBe('transfert')
    expect(s.mode).toBe('transfert')
    expect(s.montant).toBe(40000)
  })

  it.each([
    ['courante', 'moitie'],
    ['courante', 'prorata'],
    ['charge_fixe', 'prorata'],
    ['charge_fixe', 'personnalise'],
  ])("laisse passer type='%s' avec mode='%s'", (type, mode) => {
    const s = normaliser(saisie({ type, mode, partThomas: '250,00', partLiz: '150,00' }))
    expect(s.type).toBe(type)
    expect(s.mode).toBe(mode)
  })
})
