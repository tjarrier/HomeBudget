import { CODE_COMPTE_INCOMPLET, CODE_REFUS } from '@/lib/codes-connexion'

/**
 * Traduit un `error` code d'URL en copie affichable. On ne lit JAMAIS
 * `error_description` (parametre d'URL ouvert, donc controlable par un tiers :
 * vecteur d'hameconnage) : chaque bord possede son texte, le code est le seul
 * contrat. Le texte est accentue, comme toute l'UI — distinct du `MESSAGE_REFUS`
 * ASCII de `allowlist.ts`, qui sert au log et aux consommateurs non navigateur.
 */
const MESSAGES: Record<string, string> = {
  [CODE_REFUS]:
    "Cette adresse Google n'est pas autorisée. HomeBudget est un budget privé, réservé à deux comptes.",
  [CODE_COMPTE_INCOMPLET]:
    "Ton compte n'est pas tout à fait prêt. Reconnecte-toi, ou préviens Thomas si ça persiste.",
}

const MESSAGE_GENERIQUE = "La connexion n'a pas abouti. Réessaie."

export function messageConnexion(code: string | undefined): string | null {
  if (!code) return null
  return MESSAGES[code] ?? MESSAGE_GENERIQUE
}
