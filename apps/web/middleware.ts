import { getSessionCookie } from 'better-auth/cookies'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Verification optimiste : on ne fait que constater la PRESENCE du cookie, pour
 * eviter un rendu inutile. La verification reelle est faite par exigerSession(),
 * cote serveur, dans le layout et dans chaque Server Action.
 */
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/depenses/:path*', '/config/:path*'],
}
