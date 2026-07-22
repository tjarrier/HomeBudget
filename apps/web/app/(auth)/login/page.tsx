import { BoutonGoogle } from './bouton-google'
import { messageConnexion } from './messages'

/**
 * Le premier ecran, et le seul accessible sans session. Server Component : il
 * lit `searchParams.error` (un code, jamais `error_description`) pour afficher
 * un refus comprehensible plutot qu'une erreur brute. Le groupe `(auth)` est
 * hors de la garde `exigerSession()` — cet ecran DOIT s'ouvrir sans session.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  const code = Array.isArray(error) ? error[0] : error
  const message = messageConnexion(code)

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-100 rounded-xl border border-subtle bg-surface px-8 py-10 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-emphasis text-lg font-semibold tracking-[-0.02em] text-on-emphasis"
        >
          HB
        </span>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">HomeBudget</h1>
        <p className="mt-3 text-sm leading-relaxed text-body">
          Le budget partagé de Thomas et Liz.
          <br />
          L’historique ne se recalcule jamais.
        </p>

        {message ? (
          <p
            role="alert"
            data-testid="message-connexion"
            className="mt-6 rounded-lg border border-subtle bg-muted px-4 py-3 text-left text-sm leading-relaxed text-body"
          >
            {message}
          </p>
        ) : null}

        <div className="mt-7">
          <BoutonGoogle />
        </div>

        <p className="mt-5 inline-flex items-center gap-2 text-xs text-faint">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Aucune inscription · deux comptes autorisés
        </p>
      </div>
    </main>
  )
}
