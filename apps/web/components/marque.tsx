/**
 * Le bloc d'identite du produit : le monogramme et le nom.
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
      <span
        aria-hidden="true"
        className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-emphasis text-[0.8125rem] font-semibold tracking-[-0.02em] text-on-emphasis"
      >
        HB
      </span>
      <div>
        <div className="text-base font-semibold tracking-[-0.01em]">HomeBudget</div>
        <div className="text-[0.6875rem] text-faint">Thomas &amp; Liz</div>
      </div>
    </div>
  )
}
