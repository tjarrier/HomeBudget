export type Resultat<T> = { ok: true; valeur: T } | { ok: false; message: string }

/**
 * Les gardes du domaine et les contraintes SQL JETTENT ; elles ne renvoient pas
 * de code. Leurs messages sont deja rediges pour un humain (« La version « … »
 * ne couvre pas la depense du … »). On les remonte tels quels, sans reformuler.
 */
export function enEchec(e: unknown): { ok: false; message: string } {
  const message =
    e instanceof Error && e.message ? e.message : "Une erreur inattendue s'est produite."
  return { ok: false, message }
}
