'use server'

import { exigerSession } from '@/lib/session'
import { type SaisieVersion, creerVersion } from '@homebudget/db'
import { type Charge, parserEurosSaisis } from '@homebudget/domain'
import { revalidatePath } from 'next/cache'
import { type Resultat, enEchec } from './resultat'

/**
 * Les charges arrivent en lignes « libelle=montant », une par ligne : c'est ce
 * que le formulaire produit dans un <textarea>. Les montants passent par le
 * parseur du domaine — aucun flottant n'entre.
 */
function parserCharges(brut: string): Charge[] {
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

export async function creerVersionAction(
  _precedent: Resultat<null> | null,
  form: FormData,
): Promise<Resultat<null>> {
  await exigerSession()
  try {
    const saisie: SaisieVersion = {
      libelle: String(form.get('libelle') ?? '').trim(),
      dateDebut: String(form.get('dateDebut') ?? ''),
      salaireNetThomas: parserEurosSaisis(String(form.get('salaireNetThomas') ?? '')),
      salaireNetLiz: parserEurosSaisis(String(form.get('salaireNetLiz') ?? '')),
      chargesCommunes: parserCharges(String(form.get('chargesCommunes') ?? '')),
      chargesPersoThomas: parserCharges(String(form.get('chargesPersoThomas') ?? '')),
      chargesPersoLiz: parserCharges(String(form.get('chargesPersoLiz') ?? '')),
    }
    if (!saisie.libelle) throw new Error('Le libellé de la version ne peut pas être vide.')

    await creerVersion(saisie)
    revalidatePath('/config')
    revalidatePath('/')
    return { ok: true, valeur: null }
  } catch (e) {
    return enEchec(e)
  }
}
