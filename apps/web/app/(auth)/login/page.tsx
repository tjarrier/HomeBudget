'use client'

import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'

export default function Login() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="font-heading text-[1.75rem]">HomeBudget</h1>
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Budget partagé de Thomas et Liz. L'accès est limité à deux comptes Google.
      </p>
      <Button type="button" onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}>
        Se connecter avec Google
      </Button>
    </main>
  )
}
