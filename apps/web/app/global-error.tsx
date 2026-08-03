'use client'

import posthog from 'posthog-js'
import { useEffect } from 'react'

import { initializePostHog } from '@/components/posthog-provider'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (initializePostHog()) posthog.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <main>
          <h1>Une erreur est survenue</h1>
          <button type="button" onClick={() => reset()}>
            Réessayer
          </button>
        </main>
      </body>
    </html>
  )
}
