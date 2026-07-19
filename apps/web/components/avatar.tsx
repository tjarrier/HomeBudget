import { type Personne, nomPersonne } from '@homebudget/domain'

import { cn } from '@/lib/utils'

/**
 * La pastille d'initiale d'une personne.
 *
 * L'initiale seule ne dit rien a un lecteur d'ecran, et la couleur ne distingue
 * pas les deux personnes (le systeme est achromatique) : le nom complet est
 * donc porte par `aria-label`, et l'initiale masquee. La ou l'avatar est deja
 * suivi du nom en clair, `decoratif` le retire entierement de l'arbre
 * d'accessibilite plutot que de faire annoncer « Thomas Thomas ».
 */
export function Avatar({
  personne,
  taille = 'md',
  sombre = false,
  decoratif = false,
}: {
  personne: Personne
  taille?: 'sm' | 'md'
  sombre?: boolean
  decoratif?: boolean
}) {
  const nom = nomPersonne(personne)
  return (
    <span
      {...(decoratif ? { 'aria-hidden': true } : { role: 'img', 'aria-label': nom })}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        taille === 'sm' ? 'size-[22px] text-[0.625rem]' : 'size-[30px] text-xs',
        sombre ? 'bg-emphasis text-on-emphasis' : 'border border-subtle bg-muted text-body',
      )}
    >
      {nom.charAt(0)}
    </span>
  )
}
