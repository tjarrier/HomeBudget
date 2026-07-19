'use client'

import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'

export default function Login() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-100 rounded-xl border border-subtle bg-surface px-8 py-9 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-emphasis text-[1.0625rem] font-semibold tracking-[-0.02em] text-on-emphasis"
        >
          HB
        </span>
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.01em]">HomeBudget</h1>
        <p className="mt-2.5 mb-6 text-sm leading-relaxed text-body">
          Budget partagé de Thomas et Liz. L’accès est limité à deux comptes Google autorisés.
        </p>

        <Button
          type="button"
          className="w-full"
          onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
        >
          Se connecter avec Google
        </Button>

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
