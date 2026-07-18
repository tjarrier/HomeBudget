import { describe, expect, it } from 'vitest'
import { parserCharges } from '../lib/charges.js'

describe('parserCharges', () => {
  it('parse une ligne decimale normale', () => {
    expect(parserCharges('Loyer=791,00')).toEqual([{ libelle: 'Loyer', montant: 79100 }])
  })

  it('coupe sur le dernier "=" pour ne pas casser un libelle qui en contient un', () => {
    // Un `split('=')` ou un `indexOf('=')` couperait sur le PREMIER "=" et
    // tronquerait le libelle a « Loyer (T » avec un montant illisible
    // (« x)=500,00 »). Le montant, lui, est toujours produit par
    // `toFixed(2).replace('.', ',')` et ne peut jamais contenir de "=" : c'est
    // ce qui rend `lastIndexOf('=')` toujours correct. Ce test verrouille ce
    // choix — un futur refactor vers `split('=')` corromprait silencieusement
    // les charges, qui alimentent `ratioThomas` et donc le partage de chaque
    // depense future.
    expect(parserCharges('Loyer (T=x)=500,00')).toEqual([
      { libelle: 'Loyer (T=x)', montant: 50000 },
    ])
  })

  it('renvoie un tableau vide pour un textarea vide', () => {
    expect(parserCharges('')).toEqual([])
  })

  it('refuse une ligne sans aucun "="', () => {
    expect(() => parserCharges('Loyer')).toThrow(/illisible/i)
  })

  it('refuse un libelle vide', () => {
    expect(() => parserCharges('=791,00')).toThrow(/illisible/i)
  })

  it('ignore les lignes vides et les retours a la ligne en trop', () => {
    expect(parserCharges('\nLoyer=791,00\n\n\nInternet=30,00\n\n')).toEqual([
      { libelle: 'Loyer', montant: 79100 },
      { libelle: 'Internet', montant: 3000 },
    ])
  })

  it("fait l'aller-retour avec le format produit par le formulaire (enLignes)", () => {
    // `enLignes` (apps/web/app/(app)/config/formulaire-version.tsx) produit
    // `${libelle}=${(montant / 100).toFixed(2).replace('.', ',')}` par ligne,
    // jointes par "\n". Cette fonction n'est pas exportee et vit dans un
    // composant 'use client' : on ne la restructure pas pour la rendre
    // testable, on verrouille ici le format qu'elle produit directement.
    const charges = [
      { libelle: 'Loyer', montant: 79100 },
      { libelle: 'Loyer (T=x)', montant: 50000 },
      { libelle: 'Internet', montant: 3000 },
    ]
    const brut = charges
      .map((c) => `${c.libelle}=${(c.montant / 100).toFixed(2).replace('.', ',')}`)
      .join('\n')
    expect(parserCharges(brut)).toEqual(charges)
  })
})
