'use client'

import { creerVersionAction } from '@/actions/config'
import { Carte } from '@/components/carte'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
    <Carte titre="Nouvelle version">
      <form action={action} className="flex flex-col gap-3.5">
        {/* La raison d'etre du projet, dite a l'utilisateur au moment ou il en
            doute. C'est l'un des deux seuls accents chromatiques du systeme. */}
        <p className="rounded-md bg-positive-surface px-3.5 py-3 text-[0.8125rem] leading-relaxed text-positive">
          Créer une version ne touche <strong>aucune</strong> dépense passée : leurs parts ont été
          figées le jour de leur saisie.
          {courante
            ? ` « ${courante.libelle} » (depuis le ${formaterDate(courante.dateDebut)}) sera close la veille de la date choisie.`
            : ''}
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" name="libelle" required placeholder="Révision loyer 2027" />
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
            <Label htmlFor="salaireNetThomas">Salaire Thomas (€)</Label>
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
            <Label htmlFor="salaireNetLiz">Salaire Liz (€)</Label>
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
        <p className="text-xs text-muted-foreground">
          Format : <code className="font-mono">3 300,00</code> — virgule décimale, espace pour les
          milliers. Le point n’est pas accepté comme séparateur de milliers.
        </p>

        {(
          [
            ['chargesCommunes', 'Charges communes', courante?.chargesCommunes ?? []],
            ['chargesPersoThomas', 'Charges perso Thomas', courante?.chargesPersoThomas ?? []],
            ['chargesPersoLiz', 'Charges perso Liz', courante?.chargesPersoLiz ?? []],
          ] as const
        ).map(([nom, libelle, charges]) => (
          <div key={nom} className="flex flex-col gap-1.5">
            {/* `flex-wrap` : a 360px, ce libelle long suivi de son exemple en
                <code> se chevauchent sinon (issue #6). Les douze autres Label de
                l'app n'ont pas ce probleme ; on ne touche donc pas le composant,
                seulement ces trois usages. */}
            <Label htmlFor={nom} className="flex-wrap">
              {libelle} — une par ligne, au format <code className="font-mono">Libellé=791,00</code>
            </Label>
            {/* `font-mono text-xs` seulement : la forme du controle (limite,
                rayon, anneau de focus) vient de `Textarea`, pas d'ici. Recopier
                ces classes ferait diverger ce champ des autres au premier
                correctif de contraste. */}
            <Textarea
              id={nom}
              name={nom}
              rows={4}
              defaultValue={enLignes(charges as Charge[])}
              className="font-mono text-xs"
            />
          </div>
        ))}

        {etat && !etat.ok && (
          <p data-testid="message-erreur" className="text-sm text-destructive">
            {etat.message}
          </p>
        )}

        <Button type="submit" disabled={enCours} className="w-full">
          {enCours ? 'Création…' : 'Créer la version'}
        </Button>
      </form>
    </Carte>
  )
}
