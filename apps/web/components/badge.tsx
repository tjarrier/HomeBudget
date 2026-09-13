import { cn } from '@/lib/utils'

/** L'etat d'une version de config : « En cours » ou « Close ». */
export function BadgeVersion({ close }: { close: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] leading-5 font-medium',
        close ? 'bg-muted text-muted-foreground' : 'bg-marque-surface text-marque',
      )}
    >
      {close ? 'Close' : 'En cours'}
    </span>
  )
}
