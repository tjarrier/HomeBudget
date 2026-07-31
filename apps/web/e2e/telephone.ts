/**
 * Le telephone de reference du projet, defini UNE fois pour toute la suite e2e.
 *
 * **360px de large**, la largeur plancher (DESIGN.md, issue C2) — pas 390. A
 * 390px le tableau de bord ne deborde pas : un parcours cale sur cette largeur
 * laisserait passer sans un mot les 367px de scroll horizontal que C2 corrige.
 * Le plancher est le seul viewport ou un defaut de largeur est observable.
 *
 * 740px de haut, soit un telephone court : les ecrans defilent, la barre de
 * navigation reste ancree au bord inferieur.
 *
 * `isMobile` n'est pas cosmetique. Sans lui, Chromium headless pose une barre de
 * defilement classique de 15px qui ampute `clientWidth` : on mesurerait 345px de
 * place disponible et on crierait sur des ecrans qui tiennent parfaitement dans
 * les 360px d'un telephone, dont les barres sont en surimpression. Avec, la meta
 * viewport de `app/layout.tsx` s'applique pour de vrai — c'est le rendu qu'on
 * pretend verifier.
 */
export const TELEPHONE = {
  viewport: { width: 360, height: 740 },
  isMobile: true,
  hasTouch: true,
} as const
