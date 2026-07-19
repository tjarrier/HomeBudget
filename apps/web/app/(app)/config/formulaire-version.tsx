'use client'

import { creerVersionAction } from '@/actions/config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formaterDate } from '@/lib/format'
import type { Charge, VersionConfig } from '@homebudget/domain'
import { useActionState } from 'react'

/** L'inverse de `parserCharges` de l'action : une ligne « Libellé=791,00 ». */
function enLignes(charges: Charge[]): string {
  return charges
    .map((c) => `${c.libelle}=${(c.montant / 100).toFixed(2).replace('.', ',')}`)
    .join('\n')
}

function enEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function FormulaireVersion({ courante }: { courante: VersionConfig | null }) {
  const [etat, action, enCours] = useActionState(creerVersionAction, null)

  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="font-heading text-[1.75rem] leading-tight">Créer une nouvelle version</h2>
      <p className="rounded-md bg-muted p-3 text-sm text-foreground">
        Créer une version ne touche <strong>aucune</strong> dépense passée : leurs parts ont été
        figées le jour de leur saisie. La version en cours
        {courante
          ? ` (« ${courante.libelle} », depuis le ${formaterDate(courante.dateDebut)})`
          : ''}{' '}
        sera close la veille de la date choisie.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="libelle">Libellé</Label>
        <Input id="libelle" name="libelle" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dateDebut">Prise d'effet</Label>
        <Input id="dateDebut" name="dateDebut" type="date" required />
      </div>

      {/* Un salaire depasse toujours 999 € : c'est le seul champ du projet ou le
          separateur de milliers se pose des la premiere saisie. Le parseur accepte
          l'espace (« 3 300,00 ») et la virgule decimale, mais REFUSE le point
          (« 3.300,00 »). Ce choix strict se defend — il ne peut pas confondre un
          separateur de milliers avec un separateur decimal ; l'absence
          d'indication, elle, ne se defendait pas. */}
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="salaireNetThomas">Salaire net Thomas (€)</Label>
          <Input
            id="salaireNetThomas"
            name="salaireNetThomas"
            required
            inputMode="decimal"
            placeholder="3 300,00"
            defaultValue={courante ? enEuros(courante.salaireNetThomas) : ''}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="salaireNetLiz">Salaire net Liz (€)</Label>
          <Input
            id="salaireNetLiz"
            name="salaireNetLiz"
            required
            inputMode="decimal"
            placeholder="2 100,00"
            defaultValue={courante ? enEuros(courante.salaireNetLiz) : ''}
          />
        </div>
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">
        Format attendu : <code>3 300,00</code> — virgule pour les décimales, espace (ou rien) pour
        les milliers. Le point n’est pas accepté comme séparateur de milliers.
      </p>

      {(
        [
          ['chargesCommunes', 'Charges communes', courante?.chargesCommunes ?? []],
          ['chargesPersoThomas', 'Charges perso Thomas', courante?.chargesPersoThomas ?? []],
          ['chargesPersoLiz', 'Charges perso Liz', courante?.chargesPersoLiz ?? []],
        ] as const
      ).map(([nom, libelle, charges]) => (
        <div key={nom} className="flex flex-col gap-1.5">
          <Label htmlFor={nom}>
            {libelle} — une par ligne, au format <code>Libellé=791,00</code>
          </Label>
          <textarea
            id={nom}
            name={nom}
            rows={3}
            defaultValue={enLignes(charges as Charge[])}
            className="rounded-t-md border-0 border-b border-border bg-muted p-3 font-mono text-xs outline-none transition-colors focus-visible:border-b-2 focus-visible:border-primary"
          />
        </div>
      ))}

      {etat && !etat.ok && (
        <p data-testid="message-erreur" className="text-sm text-destructive">
          {etat.message}
        </p>
      )}

      <Button type="submit" disabled={enCours}>
        {enCours ? 'Création…' : 'Créer la version'}
      </Button>
    </form>
  )
}
