'use client'

import posthog from 'posthog-js'
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
const PostHogReadyContext = createContext(false)

export function initializePostHog() {
  if (posthog.__loaded) return true

  if (!projectToken) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured',
      )
    }
    return false
  }

  if (!host) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured',
      )
    }
    return false
  }

  posthog.init(projectToken, {
    api_host: host,
    defaults: '2025-05-24',
    capture_exceptions: true,
  })
  return true
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(posthog.__loaded)

  useEffect(() => {
    setIsReady(initializePostHog())
  }, [])

  return <PostHogReadyContext.Provider value={isReady}>{children}</PostHogReadyContext.Provider>
}

export function PostHogIdentify({ userId, name }: { userId: string; name: string }) {
  const isReady = useContext(PostHogReadyContext)

  useEffect(() => {
    if (!isReady) return

    posthog.identify(userId, { name })
  }, [isReady, name, userId])

  return null
}
