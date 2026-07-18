'use server'

import { parserCharges } from '@/lib/charges'
import { exigerSession } from '@/lib/session'
import { type SaisieVersion, creerVersion } from '@homebudget/db'
import { parserEurosSaisis } from '@homebudget/domain'
import { revalidatePath } from 'next/cache'
import { type Resultat, enEchec } from './resultat'

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
