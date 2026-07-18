import { type Charge, parserEurosSaisis } from '@homebudget/domain'

/**
 * Les charges arrivent en lignes « libelle=montant », une par ligne : c'est ce
 * que le formulaire produit dans un <textarea>. Les montants passent par le
 * parseur du domaine — aucun flottant n'entre.
 *
 * Extrait de `actions/config.ts` : une action serveur (`'use server'`) ne peut
 * exporter que des fonctions async, et cette fonction est volontairement
 * synchrone — elle ne fait ni I/O ni appel reseau.
 *
 * `lastIndexOf('=')` plutot que `indexOf` ou `split('=')` : un libelle peut
 * lui-meme contenir un `=` (ex. « Loyer (T=x)=500,00 »), alors que le montant
 * qui suit est toujours produit par `toFixed(2).replace('.', ',')` et ne peut
 * jamais en contenir. Prendre le dernier `=` est donc toujours correct ; le
 * premier ou un `split` naif couperait au mauvais endroit.
 */
export function parserCharges(brut: string): Charge[] {
  return brut
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((ligne) => {
      const separateur = ligne.lastIndexOf('=')
      if (separateur < 1) {
        throw new Error(`Charge illisible : « ${ligne} ». Format attendu : Libellé=791,00`)
      }
      return {
        libelle: ligne.slice(0, separateur).trim(),
        montant: parserEurosSaisis(ligne.slice(separateur + 1)),
      }
    })
}
