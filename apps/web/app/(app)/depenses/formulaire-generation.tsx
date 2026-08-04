'use client'

import { genererChargeFixeAction } from '@/actions/depenses'
import { Carte } from '@/components/carte'
import { Montant } from '@/components/montant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { aujourdhuiLocal, formaterDate } from '@/lib/format'
import { type Personne, dateMaxDepense } from '@homebudget/domain'
import { useActionState, useState } from 'react'

/** `2026-08-04` -> `2026-08`, le format exact d'un `<input type="month">`. */
const moisCourant = () => aujourdhuiLocal().slice(0, 7)

export function FormulaireGeneration({ personne }: { personne: Personne }) {
  const [etat, action, enCours] = useActionState(genererChargeFixeAction, null)
  const [mois, setMois] = useState(moisCourant)
  // Meme raison que le formulaire de saisie : on paie le plus souvent ce qu'on
  // declenche. Le champ reste modifiable — se tromper de payeur sur le loyer
  // deplace la dette du montant entier.
  const [payePar, setPayePar] = useState<string>(personne)

  return (
    <Carte titre="Charge fixe du mois">
      <p className="mb-3.5 text-sm text-muted-foreground">
        Le total des charges communes de la config en vigueur, réparti au prorata. Un mois déjà
        généré n’est jamais dupliqué.
      </p>

      <form action={action} className="flex flex-col gap-3.5">
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="mois">Mois</Label>
            {/* `<input type="month">` rend exactement `AAAA-MM`, le format
                qu'attend le domaine : aucun parsing a ecrire, aucun a se
                tromper. `max` reprend la borne de #29 — un confort seulement,
                le serveur reste la seule autorite. */}
            <Input
              id="mois"
              name="mois"
              type="month"
              required
              max={dateMaxDepense(aujourdhuiLocal()).slice(0, 7)}
              value={mois}
              onChange={(e) => setMois(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="payeParGeneration">Payé par</Label>
            <Select
              id="payeParGeneration"
              name="payePar"
              value={payePar}
              onChange={(e) => setPayePar(e.target.value)}
            >
              <option value="thomas">Thomas</option>
              <option value="liz">Liz</option>
            </Select>
          </div>
        </div>

        <Button type="submit" variant="discret" disabled={enCours} className="w-full">
          {enCours ? 'Génération…' : 'Générer la charge'}
        </Button>

        {etat?.ok && (
          <div
            data-testid="resultat-generation"
            className="rounded-lg border border-subtle bg-muted px-3.5 py-3 text-sm"
          >
            {/* Le cas « rien ecrit » se dit en toutes lettres. Sans phrase, la
                liste ne bouge pas et l'ecran ressemble a une panne. */}
            <p className="font-semibold">
              {etat.valeur.creee ? 'Charge générée' : 'Ce mois était déjà généré'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {etat.valeur.description} — <Montant cents={etat.valeur.montant} niveau="discret" />{' '}
              au {formaterDate(etat.valeur.date)}
            </p>
          </div>
        )}

        {etat && !etat.ok && (
          <p data-testid="message-erreur-generation" className="text-sm text-destructive">
            {etat.message}
          </p>
        )}
      </form>
    </Carte>
  )
}
