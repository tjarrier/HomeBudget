'use server'

import { exigerSession } from '@/lib/session'
import {
  type SaisieDepense,
  ajouterDepense,
  calculerPartsPourSaisie,
  listerVersions,
} from '@homebudget/db'
import {
  type Cents,
  type ModeRepartition,
  type Parts,
  type Personne,
  type TypeDepense,
  parserEurosSaisis,
  totalChargesCommunes,
} from '@homebudget/domain'
import { revalidatePath } from 'next/cache'
import { type Resultat, enEchec } from './resultat'

/** Ce que le navigateur envoie : des chaines, jamais des nombres. */
export interface SaisieBrute {
  date: string
  description: string
  montant: string
  payePar: string
  type: string
  mode: string
  partThomas?: string
  partLiz?: string
  commentaire?: string
}

export interface Apercu {
  parts: Parts
  versionLibelle: string
  versionDateDebut: string
  totalChargesCommunes: Cents
}

const PERSONNES: readonly string[] = ['thomas', 'liz']
const TYPES: readonly string[] = ['charge_fixe', 'courante', 'transfert']
const MODES: readonly string[] = ['prorata', 'moitie', 'personnalise', 'transfert']

/**
 * Validation de la frontiere : le navigateur peut envoyer n'importe quoi.
 * On convertit en centimes ICI, une fois — aucun flottant ne va plus loin.
 */
function normaliser(brut: SaisieBrute): SaisieDepense {
  if (!PERSONNES.includes(brut.payePar)) throw new Error(`Payeur inconnu : ${brut.payePar}`)
  if (!TYPES.includes(brut.type)) throw new Error(`Type de dépense inconnu : ${brut.type}`)
  if (!MODES.includes(brut.mode)) throw new Error(`Mode de répartition inconnu : ${brut.mode}`)
  if (!brut.description.trim()) throw new Error('La description ne peut pas être vide.')

  const mode = brut.mode as ModeRepartition
  const partsPersonnalisees =
    mode === 'personnalise'
      ? {
          thomas: parserEurosSaisis(brut.partThomas ?? ''),
          liz: parserEurosSaisis(brut.partLiz ?? ''),
        }
      : undefined

  const commentaire = brut.commentaire?.trim()

  return {
    date: brut.date,
    description: brut.description.trim(),
    montant: parserEurosSaisis(brut.montant),
    payePar: brut.payePar as Personne,
    type: brut.type as TypeDepense,
    mode,
    // `exactOptionalPropertyTypes` interdit d'assigner `undefined` a une cle
    // optionnelle : on n'ajoute la cle que lorsqu'elle a une valeur.
    ...(partsPersonnalisees ? { partsPersonnalisees } : {}),
    ...(commentaire ? { commentaire } : {}),
  }
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
