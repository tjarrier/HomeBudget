import { cn } from '@/lib/utils'

export interface OptionChoix {
  valeur: string
  libelle: string
}

/**
 * Un choix ferme parmi quelques options, habille en segments : payeur, type,
 * repartition, raccourci de date.
 *
 * Des boutons radio NATIFS, pour la raison qui a fait garder le <select> natif :
 * le clavier (fleches), l'ARIA et la soumission dans le FormData, sans une ligne
 * de JavaScript. `<fieldset>` et `<legend>` donnent son nom au groupe.
 *
 * L'input couvre TOUT le segment (`absolute inset-0`, `opacity-0`) au lieu
 * d'etre masque en `sr-only`. Un radio de 1px serait mesure par
 * `e2e/cibles-tactiles.spec.ts` et tomberait sous le plancher de 44px, et
 * Playwright ne pourrait pas le cocher sans forcer. Transparent, il recoit le
 * doigt, le clic et le focus a la taille du segment.
 *
 * `h-12` (48px) pour le dessin, `min-h-11` pour le plancher tactile que
 * `test/cibles-tactiles.test.ts` verifie a la source. `px-1` et 13px : trois
 * segments tiennent dans 320px, « Personnalisée » compris.
 */
export function Choix({
  legende,
  name,
  options,
  valeur,
  onChange,
  className,
}: {
  legende: string
  name: string
  options: readonly OptionChoix[]
  valeur: string
  onChange: (valeur: string) => void
  className?: string
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-1.5 text-[0.8125rem] font-semibold text-muted-foreground">
        {legende}
      </legend>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label
            key={option.valeur}
            className={cn(
              'relative flex h-12 min-h-11 items-center justify-center rounded-lg px-1 text-center text-[0.8125rem] leading-tight font-semibold transition-colors',
              'bg-muted text-strong',
              'has-[:checked]:bg-strong has-[:checked]:text-on-emphasis',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.valeur}
              checked={valeur === option.valeur}
              onChange={() => onChange(option.valeur)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-lg opacity-0"
            />
            {option.libelle}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
