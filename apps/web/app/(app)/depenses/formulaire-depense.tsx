'use client'

import {
  type Apercu,
  type SaisieBrute,
  ajouterDepenseAction,
  previsualiserPartsAction,
} from '@/actions/depenses'
import { Carte } from '@/components/carte'
import { Montant } from '@/components/montant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formaterDate } from '@/lib/format'
import { type Personne, type TypeDepense, dateMaxDepense, modeParDefaut } from '@homebudget/domain'
import { useActionState, useEffect, useState } from 'react'

// `toISOString()` daterait en UTC : saisi a 23 h a Paris, le champ proposerait
// demain. Un `<input type="date">` attend la date locale de celui qui saisit.
const AUJOURDHUI = () => {
  const maintenant = new Date()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')
  return `${maintenant.getFullYear()}-${mois}-${jour}`
}

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

  // B3 : les champs a defaut correct sont replies par defaut. Ils restent
  // MONTES (masques par `hidden`, pas demontes) : un <input>/<select> hidden
  // mais non disabled est serialise normalement a la soumission. Les demonter
  // enverrait la depense sans date ni payeur.
  const [detailsOuverts, setDetailsOuverts] = useState(false)

  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [messageApercu, setMessageApercu] = useState<string | null>(null)

  function changerType(nouveau: TypeDepense) {
    setType(nouveau)
    setMode(modeParDefaut(nouveau))
  }

  // Un <input type="date"> vide renvoie '' : replier rafficherait alors un
  // resume qui appelle formaterDate('') (throw, cf. lib/format.ts) et laisserait
  // un champ `required` masque bloquer la soumission sans focus possible. On
  // retablit le defaut avant de replier — c'est justement la valeur que le
  // resume annonce (« Aujourd'hui »).
  //
  // Meme famille de piege pour une date HORS BORNE (issue #29) : `hidden` ne
  // rend pas un champ valide, seulement invisible et infocalisable. Une date
  // saisie au clavier au-dela de l'horizon survivrait au repli, et le
  // navigateur refuserait alors la soumission sans rien afficher — bouton
  // "Ajouter la depense" apparemment inerte. On refuse donc de replier tant
  // que la date depasse la borne, pour que l'erreur reste visible et focalisable.
  function replier() {
    if (!date) setDate(AUJOURDHUI())
    if (date > dateMaxDepense(AUJOURDHUI())) return
    setDetailsOuverts(false)
  }

  // La ligne de resume DIT TOUJOURS LA VERITE sur ce qui sera enregistre :
  // rien n'est derive d'un contexte fige, tout vient de l'etat courant.
  function construireResume(): string {
    const dateTxt = date === AUJOURDHUI() ? "Aujourd'hui" : formaterDate(date)
    const payeurTxt = `payé par ${payePar === 'thomas' ? 'Thomas' : 'Liz'}`
    // Cas transfert : type et mode valent tous deux `transfert` — on n'affiche
    // qu'une fois `transfert`, jamais « transfert, transfert ».
    const typeMode =
      type === 'transfert' ? 'transfert' : `${LIBELLE_TYPE[type]}, ${LIBELLE_MODE[mode] ?? mode}`
    return `${dateTxt} · ${payeurTxt} · ${typeMode}`
  }

  // `type` et `mode` ne sont PAS independants : le mode « transfert » va avec le
  // type « transfert », et avec lui seul. Le serveur refuse desormais les
  // combinaisons croisees (`lib/saisie.ts`) ; l'UI ne doit donc pas les proposer,
  // sous peine de faire echouer un choix qu'elle offrait elle-meme.
  const estTransfert = type === 'transfert'
  const modesProposes = estTransfert
    ? ([['transfert', 'Transfert']] as const)
    : ([
        ['prorata', 'Au prorata des revenus'],
        ['moitie', 'Moitié-moitié'],
        ['personnalise', 'Parts personnalisées'],
      ] as const)

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

  // Un resultat de soumission ecrase l'erreur d'apercu : on ne veut jamais
  // deux messages rouges empiles qui se contredisent.
  useEffect(() => {
    if (etat) setMessageApercu(null)
  }, [etat])

  return (
    <Carte titre="Ajouter une dépense">
      <form action={action} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="montant">Montant (€)</Label>
          <Input
            id="montant"
            name="montant"
            required
            autoFocus
            inputMode="decimal"
            placeholder="1 110,58"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            required
            placeholder="Loyer + charges juillet"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {!detailsOuverts && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{construireResume()}</p>
            <Button
              type="button"
              variant="discret"
              aria-expanded={false}
              onClick={() => setDetailsOuverts(true)}
            >
              Modifier
            </Button>
          </div>
        )}

        {/* Champs a defaut correct : MONTES en permanence, masques par `hidden`
            quand replies. Voir CLAUDE.md — un select hidden reste soumis, un
            select disabled ne l'est pas. */}
        <div hidden={!detailsOuverts} className="flex flex-col gap-3.5">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                // Le selecteur natif grise l'au-dela, et le navigateur refuse la
                // soumission sans aller-retour serveur. Ce n'est qu'un confort :
                // le serveur reste la seule autorite (`verifierDatePlausible`,
                // appelee par `calculerPartsPourSaisie`). La regle n'est pas
                // dupliquee — c'est la MEME fonction du domaine des deux cotes,
                // seule la lecture de l'horloge differe : `AUJOURDHUI()` ici en
                // LOCAL, `aujourdhuiIso()` cote serveur en UTC. Entre 0 h et 2 h
                // a Paris, la borne du navigateur peut donc valoir un jour de
                // plus que celle du serveur, qui refusera alors une date que le
                // selecteur avait laisse choisir. Connu et sans danger dans ce
                // sens : rien de faux ne s'ecrit, l'apercu explique le refus.
                max={dateMaxDepense(AUJOURDHUI())}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="payePar">Payé par</Label>
              <Select
                id="payePar"
                name="payePar"
                value={payePar}
                onChange={(e) => setPayePar(e.target.value)}
              >
                <option value="thomas">Thomas</option>
                <option value="liz">Liz</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Select
              id="type"
              name="type"
              value={type}
              onChange={(e) => changerType(e.target.value as TypeDepense)}
            >
              <option value="courante">Dépense courante</option>
              <option value="charge_fixe">Charge fixe</option>
              <option value="transfert">Transfert / remboursement</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mode">Répartition</Label>
            <Select
              id="mode"
              name="mode"
              value={mode}
              disabled={estTransfert}
              onChange={(e) => setMode(e.target.value)}
            >
              {modesProposes.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </Select>
            {/* Un <select disabled> n'est pas soumis par le navigateur : sans ce
                champ cache, `mode` arriverait vide au serveur. */}
            {estTransfert && <input type="hidden" name="mode" value="transfert" />}
            {estTransfert && (
              <span className="text-xs text-muted-foreground">
                Un transfert ne se répartit pas : la totalité est portée au crédit de celui qui
                verse.
              </span>
            )}
          </div>

          {mode === 'personnalise' && (
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="partThomas">Part Thomas (€)</Label>
                <Input
                  id="partThomas"
                  name="partThomas"
                  inputMode="decimal"
                  value={partThomas}
                  onChange={(e) => setPartThomas(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
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
            <Input id="commentaire" name="commentaire" />
          </div>

          <div>
            <Button type="button" variant="discret" aria-expanded={true} onClick={replier}>
              Replier
            </Button>
          </div>
        </div>

        {/* L'apercu est calcule par la MEME fonction que l'ecriture, cote
            serveur. Un apercu qui divergerait de ce qui sera enregistre serait
            un mensonge affiche a l'utilisateur. */}
        {apercu && (
          <div
            data-testid="apercu-parts"
            className="rounded-lg border border-subtle bg-muted px-3.5 py-3"
          >
            <p className="text-sm font-semibold">Aperçu des parts</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
              <span>
                Thomas{' '}
                <Montant cents={apercu.parts.thomas} niveau="courant" testId="apercu-thomas" />
              </span>
              <span>
                Liz <Montant cents={apercu.parts.liz} niveau="courant" testId="apercu-liz" />
              </span>
            </p>
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
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

        <Button type="submit" disabled={enCours} className="w-full">
          {enCours ? 'Enregistrement…' : 'Ajouter la dépense'}
        </Button>
      </form>
    </Carte>
  )
}
