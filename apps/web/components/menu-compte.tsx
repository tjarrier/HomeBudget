'use client'

import type { Personne } from '@homebudget/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { Avatar } from '@/components/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { signOut } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import posthog from 'posthog-js'

/**
 * Qui est connecte, par ou sortir, et ou regler la configuration.
 *
 * Rendu DEUX fois, comme `Marque` : dans l'entete sous 768px (`habillage=
 * "entete"`, l'avatar seul), en pied de rail au-dessus (`"rail"`, avatar, nom
 * et chevron). Chaque exemplaire est masque par `display: none` a la taille de
 * l'autre, donc sorti de l'arbre d'accessibilite : il n'y a jamais deux boutons
 * « Compte » atteignables. Ce qui avait echoue avant l'issue #13 n'etait pas le
 * double rendu, c'etait un bouton present mais intouchable (`max-md:sr-only`).
 *
 * <dialog> NATIF, ouvert par showModal() : il apporte gratuitement le piege de
 * focus, la fermeture par Escape, l'inertisation de l'arriere-plan et
 * ::backdrop. Meme raisonnement que le <select> natif de components/ui/select.tsx.
 */
export function MenuCompte({
  personne,
  nom,
  habillage,
}: {
  personne: Personne
  nom: string
  habillage: 'entete' | 'rail'
}) {
  const feuille = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [echec, setEchec] = useState(false)

  async function seDeconnecter() {
    const { error } = await signOut()
    if (error) {
      // On reste sur place. Naviguer vers /login pendant que la session
      // survit ferait croire a l'utilisateur qu'il est sorti — c'est le
      // mensonge que cette branche existe pour supprimer.
      setEchec(true)
      return
    }
    feuille.current?.close()
    posthog.capture('user_logged_out')
    posthog.reset()
    // La session vit dans un cookie lu cote serveur : rester sur place
    // afficherait un ecran encore rendu avec l'ancienne. `replace` plutot que
    // `push` pour que le bouton retour ne ramene pas sur la coque authentifiee,
    // et `refresh` ensuite pour purger le Router Cache, qui garde encore la
    // charge RSC rendue avec la session d'avant.
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        // Dans l'entete, l'avatar seul n'a pas de texte : « Compte » est son nom.
        // Au rail, le nom visible suffit (WCAG 2.5.3, le nom accessible contient
        // le texte affiche).
        aria-label={habillage === 'entete' ? 'Compte' : undefined}
        onClick={() => {
          // A l'ouverture, pas a la fermeture : c'est le seul endroit qui
          // couvre les deux sorties de la feuille precedente (« Annuler » et
          // Escape, qui ne passe par aucun handler de bouton). Sans ca, un
          // message d'echec reste arme apres une annulation et reapparait a
          // la prochaine ouverture, alors qu'aucune tentative n'a eu lieu.
          setEchec(false)
          feuille.current?.showModal()
        }}
        className={cn(
          'flex items-center rounded-lg transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
          habillage === 'entete'
            ? '-mr-2 size-11 justify-center rounded-full'
            : 'min-h-11 w-full gap-2.5 p-2.5 text-left text-muted-foreground hover:bg-muted',
        )}
      >
        <Avatar personne={personne} decoratif />
        {habillage === 'rail' ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-strong">{nom}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m18 15-6-6-6 6" />
            </svg>
          </>
        ) : null}
      </button>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: voir le commentaire ci-dessous. */}
      <dialog
        ref={feuille}
        aria-label="Compte"
        // Le <dialog> se ferme deja au clavier par Escape ; ce handler n'ajoute
        // que le clic sur le voile. Un clic sur le ::backdrop rapporte le
        // <dialog> lui-meme comme cible — d'ou la comparaison, qui laisse passer
        // tous les clics sur le contenu.
        onClick={(evenement) => {
          if (evenement.target === feuille.current) feuille.current?.close()
        }}
        className={[
          'w-full border-0 bg-surface p-0 text-body shadow-sm backdrop:bg-overlay',
          // Sous 768px : une feuille ancree au bord bas, pleine largeur.
          'max-md:mt-auto max-md:mb-0 max-md:max-w-none max-md:rounded-t-3xl',
          // Au-dessus : une boite centree.
          'md:m-auto md:max-w-sm md:rounded-3xl',
        ].join(' ')}
      >
        <div className="flex flex-col gap-4 p-5 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2.5">
            <Avatar personne={personne} sombre decoratif />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-strong">{nom}</div>
              <div className="text-[0.6875rem] text-muted-foreground">Connecté</div>
            </div>
          </div>
          {echec && (
            <p role="alert" className="text-[0.8125rem] text-destructive">
              La déconnexion a échoué. Vérifie ta connexion et réessaie.
            </p>
          )}
          {/* `gap-3` : « Se déconnecter » / « Annuler » est la seule paire
              d'actions adjacentes du produit ou un appui de travers change de
              sens. 12px au moins entre les deux. */}
          <div className="flex flex-col gap-3">
            <Link
              href="/config"
              // La feuille vit dans le layout, qui survit a la navigation :
              // sans cette fermeture, elle resterait ouverte sur /config.
              onClick={() => feuille.current?.close()}
              className={buttonVariants({ variant: 'discret', className: 'justify-start' })}
            >
              Configuration
            </Link>
            <Button onClick={seDeconnecter}>Se déconnecter</Button>
            <Button variant="discret" onClick={() => feuille.current?.close()}>
              Annuler
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
