'use client'

import { creerVersionAction } from '@/actions/config'
import { Carte } from '@/components/carte'
import { Montant } from '@/components/montant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type ApercuCloture, type LigneCloture, apercuCloture } from '@/lib/apercu-cloture'
import { formaterDate } from '@/lib/format'
import type { Charge, VersionConfig } from '@homebudget/domain'
import { useActionState, useState } from 'react'

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

  // Ces quatre champs pilotent l'apercu de cloture : ils sont CONTROLES pour se
  // recalculer a chaque frappe. Ils sont pre-remplis d'apres la version courante,
  // exactement comme les `defaultValue` d'avant. Les deux textareas perso restent
  // non controles : ils n'entrent pas dans l'apercu.
  const [dateDebut, setDateDebut] = useState('')
  const [salaireNetThomas, setSalaireNetThomas] = useState(
    courante ? enEuros(courante.salaireNetThomas) : '',
  )
  const [salaireNetLiz, setSalaireNetLiz] = useState(
    courante ? enEuros(courante.salaireNetLiz) : '',
  )
  const [chargesCommunes, setChargesCommunes] = useState(
    courante ? enLignes(courante.chargesCommunes) : '',
  )

  return (
    <Carte titre="Nouvelle version">
      <form action={action} className="flex flex-col gap-3.5">
        {/* La raison d'etre du projet, dite a l'utilisateur au moment ou il en
            doute. C'est l'un des deux seuls accents chromatiques du systeme.
            Le detail « quelle version, quelle date » a quitte ce bandeau statique
            pour vivre dans l'apercu de cloture, ou il devient precis et vivant. */}
        <p className="rounded-md bg-positive-surface px-3.5 py-3 text-[0.8125rem] leading-relaxed text-positive">
          Créer une version ne touche <strong>aucune</strong> dépense passée : leurs parts ont été
          figées le jour de leur saisie.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" name="libelle" required placeholder="Révision loyer 2027" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateDebut">Prise d'effet</Label>
          <Input
            id="dateDebut"
            name="dateDebut"
            type="date"
            required
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
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
              value={salaireNetThomas}
              onChange={(e) => setSalaireNetThomas(e.target.value)}
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
              value={salaireNetLiz}
              onChange={(e) => setSalaireNetLiz(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Format : <code className="font-mono">3 300,00</code> — virgule décimale, espace pour les
          milliers. Le point n’est pas accepté comme séparateur de milliers.
        </p>

        {/* Charges communes : CONTROLE, car son total alimente l'apercu de cloture. */}
        <div className="flex flex-col gap-1.5">
          {/* `flex-wrap` : a 360px, ce libelle long suivi de son exemple en <code>
              se chevauchent sinon (issue #6). */}
          <Label htmlFor="chargesCommunes" className="flex-wrap">
            Charges communes — une par ligne, au format{' '}
            <code className="font-mono">Libellé=791,00</code>
          </Label>
          <Textarea
            id="chargesCommunes"
            name="chargesCommunes"
            rows={4}
            value={chargesCommunes}
            onChange={(e) => setChargesCommunes(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        {/* Perso Thomas/Liz : hors apercu, non controles (defaultValue). */}
        {(
          [
            ['chargesPersoThomas', 'Charges perso Thomas', courante?.chargesPersoThomas ?? []],
            ['chargesPersoLiz', 'Charges perso Liz', courante?.chargesPersoLiz ?? []],
          ] as const
        ).map(([nom, libelle, charges]) => (
          <div key={nom} className="flex flex-col gap-1.5">
            <Label htmlFor={nom} className="flex-wrap">
              {libelle} — une par ligne, au format <code className="font-mono">Libellé=791,00</code>
            </Label>
            {/* `font-mono text-xs` seulement : la forme du controle vient de `Textarea`. */}
            <Textarea
              id={nom}
              name={nom}
              rows={4}
              defaultValue={enLignes(charges as Charge[])}
              className="font-mono text-xs"
            />
          </div>
        ))}

        {/* L'apercu de cloture : le dernier point de lecture avant de valider.
            Absent tant qu'il n'y a rien a fermer (premiere version). */}
        {courante ? (
          <ApercuClotureVue
            courante={courante}
            apercu={apercuCloture(courante, {
              dateDebut,
              salaireNetThomas,
              salaireNetLiz,
              chargesCommunes,
            })}
          />
        ) : null}

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

/** Ce que la creation ferme, et ce qu'elle change. Aucun calcul ici : tout vient
    du helper `apercuCloture`. */
function ApercuClotureVue({
  courante,
  apercu,
}: {
  courante: VersionConfig
  apercu: ApercuCloture
}) {
  return (
    <div
      data-testid="apercu-cloture"
      className="rounded-lg border border-subtle bg-muted px-3.5 py-3"
    >
      {apercu.dateCloture ? (
        <>
          <p className="text-[0.8125rem] text-body">
            Clôture de « {courante.libelle} » au{' '}
            <strong className="text-strong">{formaterDate(apercu.dateCloture)}</strong>
          </p>
          {apercu.lignes.length > 0 ? (
            <>
              <h4 className="mt-2.5 mb-1.5 text-[0.6875rem] tracking-[0.05em] text-faint uppercase">
                Ce qui change
              </h4>
              <ul className="flex flex-col gap-1">
                {apercu.lignes.map((l) => (
                  <li key={l.libelle} className="flex items-center justify-between gap-2.5 text-xs">
                    <span className="text-muted-foreground">{l.libelle}</span>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="sr-only">avant : </span>
                      <ValeurCloture ligne={l} bord="avant" />
                      <span aria-hidden="true" className="text-faint">
                        →
                      </span>
                      <span className="sr-only">après : </span>
                      <ValeurCloture ligne={l} bord="apres" />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1.5 text-xs text-faint">
              Aucun chiffre ne change — seule la période bascule.
            </p>
          )}
        </>
      ) : apercu.dateTropTot ? (
        <p className="text-xs text-faint">
          La prise d'effet doit être postérieure au {formaterDate(courante.dateDebut)} de la version
          en cours.
        </p>
      ) : (
        <p className="text-xs text-faint">
          Choisissez une prise d'effet pour voir ce que la clôture ferme.
        </p>
      )}
    </div>
  )
}

/** Une valeur avant/apres : ancien en attenue, nouveau en accentue. Achromatique. */
function ValeurCloture({ ligne, bord }: { ligne: LigneCloture; bord: 'avant' | 'apres' }) {
  const valeur = bord === 'avant' ? ligne.avant : ligne.apres
  const fort = bord === 'apres'
  if (ligne.unite === 'pourcent') {
    return (
      <span
        className={
          fort ? 'font-semibold tabular-nums text-strong' : 'tabular-nums text-muted-foreground'
        }
      >
        {Math.round(valeur * 100)} %
      </span>
    )
  }
  return (
    <Montant
      cents={valeur}
      niveau={fort ? 'courant' : 'discret'}
      className={fort ? 'text-xs text-strong' : 'text-xs'}
    />
  )
}
