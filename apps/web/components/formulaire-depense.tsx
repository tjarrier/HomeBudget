'use client'

import {
  type Apercu,
  type SaisieBrute,
  ajouterDepenseAction,
  previsualiserPartsAction,
} from '@/actions/depenses'
import { Montant } from '@/components/montant'
import { Button } from '@/components/ui/button'
import { Choix } from '@/components/ui/choix'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { aujourdhuiLocal, formaterDate, montantPourSaisie, veille } from '@/lib/format'
import {
  type Cents,
  type Personne,
  type TypeDepense,
  dateMaxDepense,
  modeParDefaut,
} from '@homebudget/domain'
import posthog from 'posthog-js'
import { useActionState, useEffect, useState } from 'react'

const LIBELLE_TYPE: Record<TypeDepense, string> = {
  courante: 'courante',
  charge_fixe: 'charge fixe',
  transfert: 'transfert',
}

const LIBELLE_MODE: Record<string, string> = {
  prorata: 'au prorata',
  moitie: 'moitié-moitié',
  personnalise: 'parts personnalisées',
  transfert: 'transfert',
}

const PAYEURS = [
  { valeur: 'thomas', libelle: 'Thomas' },
  { valeur: 'liz', libelle: 'Liz' },
] as const

const TYPES = [
  { valeur: 'courante', libelle: 'Courante' },
  { valeur: 'charge_fixe', libelle: 'Charge fixe' },
  { valeur: 'transfert', libelle: 'Transfert' },
] as const

// Le mode « transfert » n'est jamais propose : il va avec le type « transfert »,
// et avec lui seul (`lib/saisie.ts` refuse les combinaisons croisees).
const MODES = [
  { valeur: 'prorata', libelle: 'Au prorata' },
  { valeur: 'moitie', libelle: 'Moitié' },
  { valeur: 'personnalise', libelle: 'Personnalisée' },
] as const

const RACCOURCIS_DATE = [
  { valeur: 'aujourdhui', libelle: "Aujourd'hui" },
  { valeur: 'hier', libelle: 'Hier' },
  { valeur: 'autre', libelle: 'Autre date' },
] as const

export function FormulaireDepense({
  personne,
  reglement,
  onEnregistree,
}: {
  personne: Personne
  /**
   * Pose par « Régler les comptes » (issue #26) : le solde courant et la
   * personne qui le DOIT. `| undefined` explicite — `exactOptionalPropertyTypes`
   * refuse qu'on passe `undefined` a un prop simplement optionnel.
   */
  reglement?: { montant: Cents; payePar: Personne } | undefined
  /** Appelee apres une ecriture reussie : la feuille se ferme. Doit etre stable. */
  onEnregistree: () => void
}) {
  const [etat, action, enCours] = useActionState(ajouterDepenseAction, null)

  // Un reglement est un TRANSFERT : `type` et `mode` valent tous deux
  // `transfert`, et `normaliser()` refuse toute combinaison croisee.
  const typeInitial: TypeDepense = reglement ? 'transfert' : 'courante'

  const [date, setDate] = useState(aujourdhuiLocal)
  const [description, setDescription] = useState(reglement ? 'Règlement des comptes' : '')
  const [montant, setMontant] = useState(reglement ? montantPourSaisie(reglement.montant) : '')
  // Pre-rempli avec la personne connectee : dans neuf cas sur dix, on saisit
  // ce qu'on vient de payer soi-meme. Un reglement impose le DEBITEUR : c'est
  // lui qui verse, et l'inverser doublerait la dette au lieu de l'annuler
  // (CLAUDE.md, « Le piege qui coute de l'argent »).
  const [payePar, setPayePar] = useState<string>(reglement?.payePar ?? personne)
  const [type, setType] = useState<TypeDepense>(typeInitial)
  const [mode, setMode] = useState<string>(modeParDefaut(typeInitial))
  const [partThomas, setPartThomas] = useState('')
  const [partLiz, setPartLiz] = useState('')
  const [commentaire, setCommentaire] = useState('')

  // B3 : les champs a defaut correct sont replies par defaut. Ils restent
  // MONTES (masques par `hidden`, pas demontes) : un champ hidden mais non
  // disabled est serialise normalement a la soumission. Les demonter enverrait
  // la depense sans date ni type.
  const [detailsOuverts, setDetailsOuverts] = useState(false)
  // « Autre date » choisi explicitement : le champ reste visible meme si la date
  // tapee retombe sur aujourd'hui ou hier.
  const [autreDate, setAutreDate] = useState(false)

  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [messageApercu, setMessageApercu] = useState<string | null>(null)

  const aujourdhui = aujourdhuiLocal()
  const raccourciDate = autreDate
    ? 'autre'
    : date === aujourdhui
      ? 'aujourdhui'
      : date === veille(aujourdhui)
        ? 'hier'
        : 'autre'

  function choisirRaccourciDate(valeur: string) {
    if (valeur === 'autre') {
      setAutreDate(true)
      return
    }
    setAutreDate(false)
    setDate(valeur === 'hier' ? veille(aujourdhuiLocal()) : aujourdhuiLocal())
  }

  function changerType(nouveau: string) {
    setType(nouveau as TypeDepense)
    setMode(modeParDefaut(nouveau as TypeDepense))
  }

  // Un <input type="date"> vide renvoie '' : replier rafficherait alors un
  // resume qui appelle formaterDate('') (throw, cf. lib/format.ts) et laisserait
  // un champ `required` masque bloquer la soumission sans focus possible. On
  // retablit le defaut avant de replier.
  //
  // Meme famille de piege pour une date HORS BORNE (issue #29) : `hidden` ne
  // rend pas un champ valide, seulement invisible et infocalisable. On refuse
  // donc de replier tant que la date depasse la borne, pour que l'erreur reste
  // visible et focalisable.
  function replier() {
    if (!date) setDate(aujourdhuiLocal())
    if (date > dateMaxDepense(aujourdhuiLocal())) return
    setDetailsOuverts(false)
  }

  // La ligne de resume DIT TOUJOURS LA VERITE sur ce qui sera enregistre. Le
  // payeur n'y figure plus : il est visible sans deplier.
  function construireResume(): string {
    const dateTxt = date === aujourdhuiLocal() ? "Aujourd'hui" : formaterDate(date)
    // Cas transfert : type et mode valent tous deux `transfert` — on n'affiche
    // qu'une fois `transfert`, jamais « transfert, transfert ».
    const typeMode =
      type === 'transfert' ? 'transfert' : `${LIBELLE_TYPE[type]}, ${LIBELLE_MODE[mode] ?? mode}`
    return `${dateTxt} · ${typeMode}`
  }

  const estTransfert = type === 'transfert'

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

  // Un resultat de soumission ecrase l'erreur d'apercu : jamais deux messages
  // rouges empiles qui se contredisent.
  useEffect(() => {
    if (etat) setMessageApercu(null)
  }, [etat])

  // Apres une ecriture reussie, la feuille se ferme et ce formulaire est demonte :
  // c'est ce qui desarme un second clic. Vider `montant` en plus couvre les
  // quelques millisecondes entre la reponse et la navigation — le champ est
  // `required`, le navigateur refuse une soumission vide.
  useEffect(() => {
    if (etat?.ok) {
      setMontant('')
      setDescription('')
      onEnregistree()
    }
  }, [etat, onEnregistree])

  function soumettreDepense(form: FormData) {
    posthog.capture('expense_submission_started', {
      expense_type: type,
      allocation_mode: mode,
    })
    action(form)
  }

  return (
    <form action={soumettreDepense} className="flex flex-col">
      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col items-center gap-1">
          <Label htmlFor="montant">Montant (€)</Label>
          <Input
            id="montant"
            name="montant"
            required
            autoFocus
            inputMode="decimal"
            placeholder="0,00"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="h-auto bg-transparent py-1 text-center font-display text-[3.625rem] leading-[1.1] font-semibold tracking-[-0.035em]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            required
            placeholder="Courses, loyer, restaurant…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <Choix
          legende="Payé par"
          name="payePar"
          options={PAYEURS}
          valeur={payePar}
          onChange={setPayePar}
        />

        {!detailsOuverts && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.84375rem] text-muted-foreground">{construireResume()}</p>
            <Button
              type="button"
              variant="discret"
              aria-expanded={false}
              onClick={() => setDetailsOuverts(true)}
              className="-mr-3 px-3"
            >
              Modifier
            </Button>
          </div>
        )}

        <div hidden={!detailsOuverts} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Choix
              legende="Date"
              name="raccourciDate"
              options={RACCOURCIS_DATE}
              valeur={raccourciDate}
              onChange={choisirRaccourciDate}
            />
            <div hidden={raccourciDate !== 'autre'} className="flex flex-col gap-1.5">
              <Label htmlFor="date">Date de la dépense</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                // Le selecteur natif grise l'au-dela, et le navigateur refuse la
                // soumission sans aller-retour serveur. Ce n'est qu'un confort :
                // le serveur reste la seule autorite (`verifierDatePlausible`,
                // appelee par `calculerPartsPourSaisie`).
                max={dateMaxDepense(aujourdhuiLocal())}
                value={date}
                onChange={(e) => {
                  setAutreDate(true)
                  setDate(e.target.value)
                }}
              />
            </div>
          </div>

          <Choix legende="Type" name="type" options={TYPES} valeur={type} onChange={changerType} />

          {estTransfert ? (
            <div className="flex flex-col gap-1.5">
              {/* Aucun radio de mode n'est monte pour un transfert : ce champ
                  cache est la seule source de `mode`. */}
              <input type="hidden" name="mode" value="transfert" />
              <p className="text-xs text-muted-foreground">
                Un transfert ne se répartit pas : la totalité est portée au crédit de celui qui
                verse.
              </p>
            </div>
          ) : (
            <Choix
              legende="Répartition"
              name="mode"
              options={MODES}
              valeur={mode}
              onChange={setMode}
            />
          )}

          {mode === 'personnalise' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="partThomas">Part Thomas (€)</Label>
                <Input
                  id="partThomas"
                  name="partThomas"
                  inputMode="decimal"
                  value={partThomas}
                  onChange={(e) => setPartThomas(e.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="partLiz">Part Liz (€)</Label>
                <Input
                  id="partLiz"
                  name="partLiz"
                  inputMode="decimal"
                  value={partLiz}
                  onChange={(e) => setPartLiz(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commentaire">Commentaire (facultatif)</Label>
            <Input
              id="commentaire"
              name="commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
            />
          </div>

          <div>
            <Button
              type="button"
              variant="discret"
              aria-expanded={true}
              onClick={replier}
              className="-ml-3 px-3"
            >
              Replier
            </Button>
          </div>
        </div>
      </div>

      {/* Le pied reste colle en bas de la feuille quand elle defile (details
          deplies) : l'apercu et la validation ne sortent jamais de l'ecran. */}
      <div className="sticky bottom-0 mt-4 flex flex-col gap-3 border-t border-subtle bg-surface px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {/* L'apercu est calcule par la MEME fonction que l'ecriture, cote
            serveur. Un apercu qui divergerait de ce qui sera enregistre serait
            un mensonge affiche a l'utilisateur. */}
        {apercu && (
          <div data-testid="apercu-parts" className="flex flex-col gap-0.5">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.8125rem]">
              <span className="font-semibold text-muted-foreground">Aperçu des parts</span>
              <span className="font-bold">
                Thomas{' '}
                <Montant cents={apercu.parts.thomas} niveau="courant" testId="apercu-thomas" /> ·
                Liz <Montant cents={apercu.parts.liz} niveau="courant" testId="apercu-liz" />
              </span>
            </p>
            <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
              Config en vigueur au {formaterDate(apercu.versionDateDebut)} : {apercu.versionLibelle}{' '}
              — charges communes <Montant cents={apercu.totalChargesCommunes} niveau="discret" />
            </p>
          </div>
        )}

        {messageApercu && (
          <p data-testid="message-erreur-apercu" className="text-sm text-destructive">
            {messageApercu}
          </p>
        )}
        {etat && !etat.ok && (
          <p data-testid="message-erreur-envoi" className="text-sm text-destructive">
            {etat.message}
          </p>
        )}

        <Button
          type="submit"
          disabled={enCours}
          className="h-[3.375rem] w-full rounded-[1rem] text-base"
        >
          {enCours ? 'Enregistrement…' : 'Ajouter la dépense'}
        </Button>
      </div>
    </form>
  )
}
