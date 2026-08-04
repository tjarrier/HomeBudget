import type { SaisieDepense } from '@homebudget/db'
import {
  type ModeRepartition,
  type Personne,
  type TypeDepense,
  parserEurosSaisis,
} from '@homebudget/domain'

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

const PERSONNES: readonly string[] = ['thomas', 'liz']
const TYPES: readonly string[] = ['charge_fixe', 'courante', 'transfert']
const MODES: readonly string[] = ['prorata', 'moitie', 'personnalise', 'transfert']

/**
 * Le payeur, valide a la frontiere. Extrait de `normaliser` parce que la
 * generation mensuelle n'a pas de depense a normaliser — juste un mois et un
 * payeur — mais a exactement le meme besoin : `payePar` finit en `Personne`
 * par une assertion de type, que rien ne verifie a l'execution.
 */
export function personneSaisie(valeur: string): Personne {
  if (!PERSONNES.includes(valeur)) throw new Error(`Payeur inconnu : ${valeur}`)
  return valeur as Personne
}

/**
 * Validation de la frontiere : le navigateur peut envoyer n'importe quoi.
 * On convertit en centimes ICI, une fois — aucun flottant ne va plus loin.
 *
 * Cette fonction vit dans `lib/` et non dans le fichier `'use server'` pour
 * etre testable directement : un module `'use server'` ne peut exporter que
 * des fonctions asynchrones. Elle reste le point de passage unique de
 * l'ecriture ET de l'apercu — les deux appellent `normaliser`, donc l'apercu
 * ne peut pas afficher une repartition que l'ecriture refuserait.
 */
export function normaliser(brut: SaisieBrute): SaisieDepense {
  const payePar = personneSaisie(brut.payePar)
  if (!TYPES.includes(brut.type)) throw new Error(`Type de dépense inconnu : ${brut.type}`)
  if (!MODES.includes(brut.mode)) throw new Error(`Mode de répartition inconnu : ${brut.mode}`)
  if (!brut.description.trim()) throw new Error('La description ne peut pas être vide.')

  // `type` et `mode` sont deux <select> independants : chaque champ valide seul
  // laissait passer des combinaisons incoherentes, et les parts sont figees POUR
  // TOUJOURS a l'ecriture (regle 4). `type='transfert'` + `mode='moitie'`
  // partageait un versement de 400 € en 200/200 : la dette de Liz ne baissait que
  // de moitie — le piege documente de CLAUDE.md, atteint par un autre chemin que
  // l'inversion de signe. Le domaine ne rattrape pas : `calculerParts` branche sur
  // `mode`, `resumer` branche sur `type`, aucun des deux ne voit l'autre.
  // Reciproquement, `mode='transfert'` sur une depense reelle affecte 100 % du
  // montant au NON-payeur. Les deux sens sont donc interdits.
  if ((brut.type === 'transfert') !== (brut.mode === 'transfert')) {
    throw new Error(
      `Un transfert se répartit obligatoirement en mode « transfert », et le mode « transfert » ne s’applique qu’à une dépense de type transfert (reçu : type « ${brut.type} », mode « ${brut.mode} »).`,
    )
  }

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
    payePar,
    type: brut.type as TypeDepense,
    mode,
    // `exactOptionalPropertyTypes` interdit d'assigner `undefined` a une cle
    // optionnelle : on n'ajoute la cle que lorsqu'elle a une valeur.
    ...(partsPersonnalisees ? { partsPersonnalisees } : {}),
    ...(commentaire ? { commentaire } : {}),
  }
}
