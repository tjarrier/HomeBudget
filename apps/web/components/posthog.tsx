'use client'

import posthog from 'posthog-js'
import { useEffect } from 'react'

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

export function initializePostHog() {
  if (posthog.__loaded) return true

  if (!projectToken || !host) {
    return false
  }

  posthog.init(projectToken, {
    api_host: host,
    defaults: '2025-05-24',
    capture_exceptions: true,
  })
  return true
}

// A l'evaluation du module, et non dans un effet du layout racine : les effets
// courent des enfants vers les parents, donc <PostHogIdentify />, monte plus
// bas dans l'arbre, tournerait AVANT l'init. Le module, lui, est evalue avant
// tout rendu — plus rien a synchroniser, ni contexte ni etat.
// `typeof window` garde le rendu serveur, ou posthog.init n'a rien a faire.
if (typeof window !== 'undefined') initializePostHog()

/**
 * Ne rend rien. Sa seule raison d'etre est que le layout racine tire ce module
 * client dans le bundle de CHAQUE page — y compris /login, hors du groupe
 * (app) —, ou son evaluation initialise PostHog.
 */
export function PostHog() {
  return null
}

export function PostHogIdentify({ userId, name }: { userId: string; name: string }) {
  useEffect(() => {
    if (posthog.__loaded) posthog.identify(userId, { name })
  }, [name, userId])

  return null
}
