'use server'

import { type SaisieBrute, normaliser, personneSaisie } from '@/lib/saisie'
import { exigerSession } from '@/lib/session'
import {
  ajouterDepense,
  calculerPartsPourSaisie,
  genererChargeFixeDuMois,
  listerVersions,
} from '@homebudget/db'
import { type Cents, type Parts, totalChargesCommunes } from '@homebudget/domain'
import { revalidatePath } from 'next/cache'
import { type Resultat, enEchec } from './resultat'

// Le formulaire client importe ce type depuis '@/actions/depenses' : on le
// reexporte pour ne pas etaler le changement de module dans le composant.
export type { SaisieBrute }

export interface Apercu {
  parts: Parts
  versionLibelle: string
  versionDateDebut: string
  totalChargesCommunes: Cents
}

/**
 * Apercu en direct. Rejoue EXACTEMENT les etapes 3-4 du flux d'ecriture, via la
 * meme fonction `calculerPartsPourSaisie` : l'apercu ne peut pas diverger de ce
 * qui sera reellement fige. Aucune logique de config n'est expediee au navigateur.
 */
export async function previsualiserPartsAction(brut: SaisieBrute): Promise<Resultat<Apercu>> {
  await exigerSession()
  try {
    const saisie = normaliser(brut)
    const { parts, version } = calculerPartsPourSaisie(saisie, await listerVersions())
    return {
      ok: true,
      valeur: {
        parts,
        versionLibelle: version.libelle,
        versionDateDebut: version.dateDebut,
        totalChargesCommunes: totalChargesCommunes(version),
      },
    }
  } catch (e) {
    return enEchec(e)
  }
}

export async function ajouterDepenseAction(
  _precedent: Resultat<null> | null,
  form: FormData,
): Promise<Resultat<null>> {
  await exigerSession()
  try {
    const brut: SaisieBrute = {
      date: String(form.get('date') ?? ''),
      description: String(form.get('description') ?? ''),
      montant: String(form.get('montant') ?? ''),
      payePar: String(form.get('payePar') ?? ''),
      type: String(form.get('type') ?? ''),
      mode: String(form.get('mode') ?? ''),
      partThomas: String(form.get('partThomas') ?? ''),
      partLiz: String(form.get('partLiz') ?? ''),
      commentaire: String(form.get('commentaire') ?? ''),
    }
    await ajouterDepense(normaliser(brut))
    // Le solde affiche doit suivre l'ecriture, sur les deux ecrans.
    revalidatePath('/')
    revalidatePath('/depenses')
    return { ok: true, valeur: null }
  } catch (e) {
    return enEchec(e)
  }
}

export interface ChargeGenereeVue {
  /** `false` : le mois etait deja genere. La ligne rendue est celle qui existait. */
  creee: boolean
  date: string
  description: string
  montant: Cents
}

/**
 * Genere la charge fixe d'un mois.
 *
 * Aucune logique ici : le montant, la date et les parts viennent tous de
 * `genererChargeFixeDuMois`, et l'idempotence de l'index de la migration 0008.
 * Cette action valide le payeur, appelle, et rend de quoi ecrire une phrase.
 *
 * Elle renvoie la ligne meme quand elle n'a rien ecrit (`creee: false`) : sans
 * cela, un second declenchement serait indiscernable d'un echec silencieux —
 * la liste ne bouge pas, et l'ecran n'aurait rien a dire.
 */
export async function genererChargeFixeAction(
  _precedent: Resultat<ChargeGenereeVue> | null,
  form: FormData,
): Promise<Resultat<ChargeGenereeVue>> {
  await exigerSession()
  try {
    const { depense, creee } = await genererChargeFixeDuMois(
      String(form.get('mois') ?? ''),
      personneSaisie(String(form.get('payePar') ?? '')),
    )
    revalidatePath('/')
    revalidatePath('/depenses')
    return {
      ok: true,
      valeur: {
        creee,
        date: depense.date,
        description: depense.description,
        montant: depense.montant,
      },
    }
  } catch (e) {
    return enEchec(e)
  }
}
