'use client'

import { signIn } from '@/lib/auth-client'

export default function Login() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">HomeBudget</h1>
      <p className="max-w-xs text-center text-sm text-slate-600">
        Budget partagé de Thomas et Liz. L'accès est limité à deux comptes Google.
      </p>
      <button
        type="button"
        className="rounded-md bg-slate-900 px-5 py-3 text-white"
        onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
      >
        Se connecter avec Google
      </button>
    </main>
  )
}
