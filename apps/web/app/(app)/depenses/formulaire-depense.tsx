'use client'

import {
  type Apercu,
  type SaisieBrute,
  ajouterDepenseAction,
  previsualiserPartsAction,
} from '@/actions/depenses'
import { formaterDate, formaterMontant } from '@/lib/format'
import { type Personne, type TypeDepense, modeParDefaut } from '@homebudget/domain'
import { useActionState, useEffect, useState } from 'react'

const AUJOURDHUI = () => new Date().toISOString().slice(0, 10)

export function FormulaireDepense({ personne }: { personne: Personne }) {
  const [etat, action, enCours] = useActionState(ajouterDepenseAction, null)

  const [date, setDate] = useState(AUJOURDHUI)
  const [description, setDescription] = useState('')
  const [montant, setMontant] = useState('')
  // Pre-rempli avec la personne connectee : dans neuf cas sur dix, on saisit
  // ce qu'on vient de payer soi-meme. Le champ reste modifiable.
  const [payePar, setPayePar] = useState<string>(personne)
  const [type, setType] = useState<TypeDepense>('courante')
  // Le mode est PRE-SELECTIONNE d'apres le type, et reste modifiable.
  const [mode, setMode] = useState<string>(modeParDefaut('courante'))
  const [partThomas, setPartThomas] = useState('')
  const [partLiz, setPartLiz] = useState('')

  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [messageApercu, setMessageApercu] = useState<string | null>(null)

  function changerType(nouveau: TypeDepense) {
    setType(nouveau)
    setMode(modeParDefaut(nouveau))
  }

  // Apercu en direct : chaque changement significatif redemande au SERVEUR de
  // rejouer le calcul. Rien de la config ne descend dans le navigateur.
  useEffect(() => {
    if (!montant || !description) {
      setApercu(null)
      setMessageApercu(null)
      return
    }
    const brut: SaisieBrute = {
      date,
      description,
      montant,
      payePar,
      type,
      mode,
      partThomas,
      partLiz,
    }
    let annule = false
    const minuteur = setTimeout(async () => {
      const r = await previsualiserPartsAction(brut)
      if (annule) return
      if (r.ok) {
        setApercu(r.valeur)
        setMessageApercu(null)
      } else {
        setApercu(null)
        setMessageApercu(r.message)
      }
    }, 250)
    return () => {
      annule = true
      clearTimeout(minuteur)
    }
  }, [date, description, montant, payePar, type, mode, partThomas, partLiz])

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h2 className="text-lg font-semibold">Ajouter une dépense</h2>

      <label className="flex flex-col gap-1 text-sm">
        Date
        <input
          name="date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-slate-300 p-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <input
          name="description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-slate-300 p-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Montant (€)
        <input
          name="montant"
          required
          inputMode="decimal"
          placeholder="1 110,58"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className="rounded-md border border-slate-300 p-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Payé par
        <select
          name="payePar"
          value={payePar}
          onChange={(e) => setPayePar(e.target.value)}
          className="rounded-md border border-slate-300 p-2"
        >
          <option value="thomas">Thomas</option>
          <option value="liz">Liz</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Type
        <select
          name="type"
          value={type}
          onChange={(e) => changerType(e.target.value as TypeDepense)}
          className="rounded-md border border-slate-300 p-2"
        >
          <option value="courante">Dépense courante</option>
          <option value="charge_fixe">Charge fixe</option>
          <option value="transfert">Transfert / remboursement</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Répartition
        <select
          name="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="rounded-md border border-slate-300 p-2"
        >
          <option value="prorata">Au prorata des revenus</option>
          <option value="moitie">Moitié-moitié</option>
          <option value="personnalise">Parts personnalisées</option>
          <option value="transfert">Transfert</option>
        </select>
      </label>

      {mode === 'personnalise' && (
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Part Thomas (€)
            <input
              name="partThomas"
              inputMode="decimal"
              value={partThomas}
              onChange={(e) => setPartThomas(e.target.value)}
              className="rounded-md border border-slate-300 p-2"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Part Liz (€)
            <input
              name="partLiz"
              inputMode="decimal"
              value={partLiz}
              onChange={(e) => setPartLiz(e.target.value)}
              className="rounded-md border border-slate-300 p-2"
            />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Commentaire (facultatif)
        <input name="commentaire" className="rounded-md border border-slate-300 p-2" />
      </label>

      {apercu && (
        <div data-testid="apercu-parts" className="rounded-lg bg-slate-100 p-3 text-sm">
          <p className="font-medium">
            Thomas <span data-testid="apercu-thomas">{formaterMontant(apercu.parts.thomas)}</span>
            {' · '}
            Liz <span data-testid="apercu-liz">{formaterMontant(apercu.parts.liz)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Config en vigueur au {formaterDate(apercu.versionDateDebut)} : {apercu.versionLibelle} —
            charges communes {formaterMontant(apercu.totalChargesCommunes)}
          </p>
        </div>
      )}

      {messageApercu && (
        <p data-testid="message-erreur" className="text-sm text-red-700">
          {messageApercu}
        </p>
      )}
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
        {enCours ? 'Enregistrement…' : 'Ajouter la dépense'}
      </button>
    </form>
  )
}
