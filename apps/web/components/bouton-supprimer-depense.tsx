'use client'

import { supprimerDepenseAction } from '@/actions/depenses'
import { formaterEuros } from '@homebudget/domain'
import { useState, useTransition } from 'react'

/**
 * La croix de suppression d'une ligne d'historique (issue #40).
 *
 * `window.confirm()` NATIF, et non un dialogue maison : accessible partout,
 * pilotable par Playwright (`page.once('dialog', ...)`), zero composant a
 * ecrire, zero piege de focus a tenir. Echelon 4 de l'echelle.
 *
 * PAS de suppression optimiste : la ligne disparait quand le serveur a
 * revalide, jamais avant. Sur une liste dont l'unique raison d'etre est de
 * prouver que rien ne bouge apres coup, faire disparaitre une ligne qui peut
 * revenir serait le pire des mensonges d'affichage.
 *
 * Le nom accessible porte la description : sans lui, une liste de trente
 * depenses offre trente boutons homonymes a un lecteur d'ecran comme a
 * Playwright.
 */
export function BoutonSupprimerDepense({
  id,
  description,
  montant,
}: { id: string; description: string; montant: number }) {
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        aria-label={`Supprimer « ${description} »`}
        disabled={enCours}
        // `min-h-11 min-w-11` = les 44px du plancher tactile (issue C1), tenus
        // ICI parce que ce bouton ne passe pas par la primitive `Button` : il
        // n'a ni fond, ni bordure, ni `px-5`. `-mr-1.5` le ramene contre le
        // bord de la carte sans reduire sa cible.
        className="-mr-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-faint transition-colors hover:bg-muted hover:text-body focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        onClick={() => {
          if (!window.confirm(`Supprimer « ${description} » (${formaterEuros(montant)}) ?`)) return
          demarrer(async () => {
            const resultat = await supprimerDepenseAction(id)
            setErreur(resultat.ok ? null : resultat.message)
          })
        }}
      >
        <span aria-hidden="true">×</span>
      </button>

      {/* `basis-full` : dans le `<li>` en `flex flex-wrap`, le message prend une
          ligne entiere SOUS la depense, plutot que de s'ecraser dans la colonne
          de 44px du bouton. Une classe, aucun niveau de DOM en plus. */}
      {erreur ? (
        <p
          role="alert"
          data-testid="erreur-suppression"
          className="basis-full text-sm text-destructive"
        >
          {erreur}
        </p>
      ) : null}
    </>
  )
}
