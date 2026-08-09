'use client'

import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formaterMois } from '@/lib/format'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Les filtres de l'historique : le mois, et qui a avance l'argent.
 *
 * UN geste, c'est le critere de l'issue #28 : le choix dans le selecteur EST la
 * validation. Pas de bouton « Appliquer » — sur un telephone il ferait deux
 * gestes la ou le selecteur du systeme se referme deja sur un choix.
 *
 * Deux `<select>` natifs, comme partout ailleurs dans le produit : c'est la
 * roulette du systeme qui s'ouvre, pas un popup a refaire au clavier.
 *
 * Pas de filtre par TYPE, bien que la facade le sache faire (#27) : l'issue
 * demande de ne pas alourdir l'ecran, et le badge de chaque ligne se lit deja
 * d'un coup d'œil. A ajouter le jour ou on cherchera vraiment « les transferts ».
 */
export function FiltresDepenses({
  mois,
  payePar,
  moisDisponibles,
}: {
  // `| undefined` explicite : sous `exactOptionalPropertyTypes`, « absent » et
  // « present et vide » ne sont pas la meme chose, et l'appelant derive ces deux
  // valeurs d'une URL — donc presentes, parfois `undefined`.
  mois?: string | undefined
  payePar?: string | undefined
  moisDisponibles: string[]
}) {
  const router = useRouter()
  const chemin = usePathname()
  const params = useSearchParams()

  const appliquer = (cle: string, valeur: string) => {
    // On repart des parametres COURANTS : `?regler=1` (#26) survit a un
    // changement de filtre, sinon filtrer viderait le formulaire de reglement
    // deja pre-rempli.
    const suivants = new URLSearchParams(params)
    if (valeur) suivants.set(cle, valeur)
    else suivants.delete(cle)
    const requete = suivants.toString()
    // `replace` et non `push` : trois filtres essayes ne doivent pas demander
    // trois retours arriere pour quitter l'ecran.
    router.replace(requete ? `${chemin}?${requete}` : chemin)
  }

  return (
    <div className="mb-4 flex gap-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="filtreMois">Mois</Label>
        {/* `defaultValue` et non `value` : le `<select>` garde ce qu'on vient de
            choisir SANS attendre l'aller-retour serveur. Controle, il afficherait
            l'ancien mois le temps que la liste revienne — l'ecran dirait alors le
            contraire de ce qu'on a touche. Les deux valeurs se rejoignent au
            rendu suivant, puisque c'est l'URL qui a decide. */}
        <Select
          id="filtreMois"
          defaultValue={mois ?? ''}
          onChange={(e) => appliquer('mois', e.target.value)}
        >
          <option value="">Tous les mois</option>
          {moisDisponibles.map((m) => (
            <option key={m} value={m}>
              {formaterMois(m)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="filtrePayePar">Payé par</Label>
        <Select
          id="filtrePayePar"
          defaultValue={payePar ?? ''}
          onChange={(e) => appliquer('payePar', e.target.value)}
        >
          <option value="">Tout le monde</option>
          <option value="thomas">Thomas</option>
          <option value="liz">Liz</option>
        </Select>
      </div>
    </div>
  )
}
