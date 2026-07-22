/**
 * Les codes d'erreur qui transitent par `/login?error=<code>`. Une seule
 * source, cote jet (allowlist, session) ET cote lecture (l'ecran). Ce sont des
 * valeurs de contrat : les changer casse le mapping de `messages.ts`.
 *
 * Le parametre d'URL s'appelle `error` (anglais) : Better Auth l'impose dans son
 * callback OAuth, on aligne le notre dessus plutot que d'en avoir deux.
 */
export const CODE_REFUS = 'acces_refuse'
export const CODE_COMPTE_INCOMPLET = 'compte_incomplet'
