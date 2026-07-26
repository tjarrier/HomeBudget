import type { ReactNode } from 'react'

import { Marque } from '@/components/marque'
import { MenuCompte } from '@/components/menu-compte'
import { NavPrincipale } from '@/components/nav-principale'
import { exigerSession } from '@/lib/session'

/**
 * La coque de l'application.
 *
 * Au-dessus de 768px : un rail lateral fixe de 248px et une colonne de contenu
 * centree a 1080px.
 *
 * En dessous : la marque monte dans un entete, la navigation descend dans une
 * barre `fixed bottom-0` a quatre cellules — atteignable au pouce d'une main qui
 * tient l'appareil. Ce sont deux REGIONS distinctes de l'ecran, ce qu'un unique
 * <aside> pivotant par CSS ne savait plus couvrir : d'ou <Marque /> rendue deux
 * fois, chacune masquee a la taille de l'autre.
 *
 * L'<aside> reste AVANT <main> dans le DOM alors qu'il s'affiche en bas :
 * l'ordre de lecture au lecteur d'ecran (marque, navigation, contenu) prime sur
 * la coincidence avec l'ordre visuel.
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const session = await exigerSession()

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* pt : la contrepartie haute de viewport-fit=cover. En navigation Safari
          l'inset vaut 0 et le py-3 s'applique seul ; ecran d'accueil ou
          plein ecran, la marque passerait sinon sous la barre d'etat. Le
          calc() est obligatoire : un pt-[env(...)] nu ECRASERAIT le py-3, et
          l'entete se collerait au filet du haut sur tous les autres
          appareils. */}
      <header className="flex items-center border-b border-subtle bg-surface px-5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden">
        <Marque />
      </header>

      {/* md:pl et le md:pr plus bas sur la colonne de contenu sont la
          contrepartie de viewport-fit=cover (app/layout.tsx) : il etend le
          document sous TOUTES les encoches, pas seulement le bas. En paysage
          sur un iPhone a encoche (844px de large, le point d'arret md:), le
          rail se retrouverait sinon partiellement sous l'encoche gauche. */}
      <aside className="flex shrink-0 border-subtle bg-surface max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:items-stretch max-md:border-t max-md:px-2 max-md:pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-screen md:w-62 md:flex-col md:border-r md:p-4 md:pl-[env(safe-area-inset-left)]">
        <div className="max-md:hidden md:px-2 md:pt-1 md:pb-5">
          <Marque />
        </div>

        <NavPrincipale />
        <MenuCompte personne={session.personne} nom={session.nom} />
      </aside>

      {/* pr : meme contrepartie que le pl du rail, cote droit. */}
      <div className="min-w-0 flex-1 md:pr-[env(safe-area-inset-right)]">
        {/* 5rem = la barre basse (60px, 59 de contenu + 1 de filet) plus une
            respiration : sans cette reserve, la derniere ligne de depense se
            cache dessous. `env()` y ajoute l'indicateur d'accueil des
            iPhone — nul partout ailleurs. */}
        <main className="mx-auto max-w-[1080px] px-5 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-10 md:pt-7 md:pb-14">
          {children}
        </main>
      </div>
    </div>
  )
}
