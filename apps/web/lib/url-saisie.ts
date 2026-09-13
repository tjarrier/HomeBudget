/**
 * L'etat ouvert de la feuille de saisie vit dans l'URL (spec 2026-09-13) :
 * `?saisie=1` l'ouvre, `?saisie=regler` l'ouvre pre-remplie pour regler les
 * comptes. Meme choix que « Voir plus » (#41) : un lien fonctionne sans
 * JavaScript, le bouton retour du telephone ferme la feuille, et un test l'ouvre
 * par `goto()`.
 *
 * Les autres parametres — les filtres de /depenses, `n` — survivent a
 * l'ouverture comme a la fermeture : on saisit PAR-DESSUS l'ecran courant.
 */
export type ModeSaisie = 'libre' | 'regler'

export function modeSaisie(valeur: string | null): ModeSaisie | null {
  if (valeur === '1') return 'libre'
  if (valeur === 'regler') return 'regler'
  return null
}

export function lienOuvrirSaisie(
  chemin: string,
  params: URLSearchParams,
  mode: ModeSaisie,
): string {
  const suite = new URLSearchParams(params)
  suite.set('saisie', mode === 'regler' ? 'regler' : '1')
  return `${chemin}?${suite}`
}

export function lienFermerSaisie(chemin: string, params: URLSearchParams): string {
  const suite = new URLSearchParams(params)
  suite.delete('saisie')
  const requete = suite.toString()
  return requete ? `${chemin}?${requete}` : chemin
}
