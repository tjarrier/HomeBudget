'use client'

import type { Personne } from '@homebudget/domain'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { Avatar } from '@/components/avatar'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-client'
import posthog from 'posthog-js'

/**
 * Qui est connecte, et par ou sortir.
 *
 * UN declencheur et UNE feuille, deux habillages : quatrieme cellule de la barre
 * basse sous 768px, pied de rail au-dessus. Le dedoubler dedoublerait le chemin
 * de deconnexion — et c'est exactement ce qui avait echoue : le pied de rail
 * portait bien un bouton « Quitter », mais dans un conteneur `max-md:sr-only`.
 * Il existait, personne ne pouvait le toucher.
 *
 * <dialog> NATIF, ouvert par showModal() : il apporte gratuitement le piege de
 * focus, la fermeture par Escape, l'inertisation de l'arriere-plan et
 * ::backdrop. Meme raisonnement que le <select> natif de components/ui/select.tsx.
 */
export function MenuCompte({ personne, nom }: { personne: Personne; nom: string }) {
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
        onClick={() => {
          // A l'ouverture, pas a la fermeture : c'est le seul endroit qui
          // couvre les deux sorties de la feuille precedente (« Annuler » et
          // Escape, qui ne passe par aucun handler de bouton). Sans ca, un
          // message d'echec reste arme apres une annulation et reapparait a
          // la prochaine ouverture, alors qu'aucune tentative n'a eu lieu.
          setEchec(false)
          feuille.current?.showModal()
        }}
        className={[
          'flex items-center rounded-lg transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
          // Barre basse : la quatrieme cellule, au meme gabarit que les trois liens.
          'max-md:min-h-11 max-md:w-1/4 max-md:flex-col max-md:justify-center max-md:gap-0.5 max-md:py-1.5',
          // Rail : l'encart de pied, pousse en bas par mt-auto. 52px de fait
          // (avatar 30px + p-2.5 des deux cotes), pas par contrainte : md:min-h-11
          // le rend explicite plutot que fortuit.
          'md:mt-auto md:min-h-11 md:w-full md:gap-2.5 md:border md:border-subtle md:p-2.5 md:text-left',
          'text-muted-foreground hover:bg-muted/60',
        ].join(' ')}
      >
        <Avatar personne={personne} sombre decoratif />
        <span className="hidden min-w-0 flex-1 truncate text-sm font-medium text-strong md:inline">
          {nom}
        </span>
        <span className="text-[0.625rem] font-medium md:hidden">Compte</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="hidden size-4 shrink-0 md:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
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
          'max-md:mt-auto max-md:mb-0 max-md:max-w-none max-md:rounded-t-xl',
          // Au-dessus : une boite centree.
          'md:m-auto md:max-w-sm md:rounded-xl',
        ].join(' ')}
      >
        <div className="flex flex-col gap-4 p-5 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2.5">
            <Avatar personne={personne} sombre decoratif />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-strong">{nom}</div>
              <div className="text-[0.6875rem] text-faint">Connecté</div>
            </div>
          </div>
          {echec && (
            <p role="alert" className="text-[0.8125rem] text-destructive">
              La déconnexion a échoué. Vérifie ta connexion et réessaie.
            </p>
          )}
          {/* `gap-3` : la seule paire d'actions adjacentes du produit, et la
              seule ou un appui de travers change de sens. 8px separaient deux
              cibles de 44px — sous le pouce, c'est la largeur d'une erreur. */}
          <div className="flex flex-col gap-3">
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
