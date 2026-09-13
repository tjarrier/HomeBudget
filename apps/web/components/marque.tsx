/**
 * Le bloc d'identite du produit : le nom, en Bricolage Grotesque.
 *
 * Il est rendu DEUX FOIS dans la coque — dans l'entete sous 768px, en tete du
 * rail au-dessus —, jamais deux fois a l'ecran : chaque exemplaire porte la
 * bascule qui masque l'autre. Le dupliquer coute moins qu'un exemplaire unique
 * qu'il faudrait deplacer par CSS entre deux regions distinctes de l'ecran.
 * C'est du balisage statique : il ne porte aucun comportement, donc rien a
 * desynchroniser.
 */
export function Marque() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-display text-[1.3125rem] font-bold tracking-[-0.02em]">HomeBudget</span>
    </div>
  )
}
