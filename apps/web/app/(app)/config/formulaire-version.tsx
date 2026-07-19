'use client'

import { creerVersionAction } from '@/actions/config'
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
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-semibold">Créer une nouvelle version</h2>
      <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
        Créer une version ne touche <strong>aucune</strong> dépense passée : leurs parts ont été
        figées le jour de leur saisie. La version en cours
        {courante
          ? ` (« ${courante.libelle} », depuis le ${formaterDate(courante.dateDebut)})`
          : ''}{' '}
        sera close la veille de la date choisie.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Libellé
        <input name="libelle" required className="rounded-md border border-slate-300 p-2" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Prise d'effet
        <input
          name="dateDebut"
          type="date"
          required
          className="rounded-md border border-slate-300 p-2"
        />
      </label>

      {/* Un salaire depasse toujours 999 € : c'est le seul champ du projet ou le
          separateur de milliers se pose des la premiere saisie. Le parseur accepte
          l'espace (« 3 300,00 ») et la virgule decimale, mais REFUSE le point
          (« 3.300,00 »). Ce choix strict se defend — il ne peut pas confondre un
          separateur de milliers avec un separateur decimal ; l'absence
          d'indication, elle, ne se defendait pas. */}
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Salaire net Thomas (€)
          <input
            name="salaireNetThomas"
            required
            inputMode="decimal"
            placeholder="3 300,00"
            defaultValue={courante ? enEuros(courante.salaireNetThomas) : ''}
            className="rounded-md border border-slate-300 p-2"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Salaire net Liz (€)
          <input
            name="salaireNetLiz"
            required
            inputMode="decimal"
            placeholder="2 100,00"
            defaultValue={courante ? enEuros(courante.salaireNetLiz) : ''}
            className="rounded-md border border-slate-300 p-2"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
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
        <label key={nom} className="flex flex-col gap-1 text-sm">
          {libelle} — une par ligne, au format <code>Libellé=791,00</code>
          <textarea
            name={nom}
            rows={3}
            defaultValue={enLignes(charges as Charge[])}
            className="rounded-md border border-slate-300 p-2 font-mono text-xs"
          />
        </label>
      ))}

      {etat && !etat.ok && (
        <p data-testid="message-erreur" className="text-sm text-red-700">
          {etat.message}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="rounded-md bg-slate-900 px-4 py-3 text-white disabled:opacity-50"
      >
        {enCours ? 'Création…' : 'Créer la version'}
      </button>
    </form>
  )
}
