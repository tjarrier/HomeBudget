# B4 — Formulaire de version : rendre lisibles la période et la clôture

**Issue :** [#11](https://github.com/tjarrier/HomeBudget/issues/11) — *B4, Formulaire
de version : rendre lisibles la période et la clôture.*
**Fichier principal touché :** `apps/web/app/(app)/config/formulaire-version.tsx`.
**Helper ajouté :** `apps/web/lib/apercu-cloture.ts` (+ son test).
**Date :** 2026-07-21.

## Le problème

Créer une version **clôture la précédente la veille de sa prise d'effet**. C'est la
raison d'être du projet — le remplacement d'un Sheet qui recalculait tout
l'historique — et pourtant l'écran ne la donne pas à voir. Au moment de valider,
l'utilisateur ne sait pas :

- **quelle version** il est en train de fermer ;
- **à quelle date exacte** elle sera close (la veille de la prise d'effet, jamais
  affichée : le calcul reste dans le domaine) ;
- **ce qui change** entre la règle sortante et celle qu'il saisit.

Le formulaire porte aujourd'hui un seul mot sur le sujet, dans le bandeau emerald
de réassurance :

> « Loyer 2026 » (depuis le 01/01/2026) sera close **la veille de la date choisie**.

« La veille de la date choisie » est une paraphrase de la règle, pas la date. Elle
ne se recalcule pas, ne montre aucun avant/après, et disparaît dans une phrase qui
parle surtout d'autre chose (les parts figées).

## Le « Fini quand »

> Avant de valider, on voit **quelle version va être clôturée**, **à quelle date**,
> et **ce qui change**.

## Ce qu'on ne touche pas

- **Le domaine, la façade `packages/db`, les Server Actions.** Aucune règle de
  calcul, de clôture ou de résolution de version ne change. L'aperçu **réutilise**
  les fonctions pures du domaine (`veilleDe`, `ratioThomas`, `totalChargesCommunes`,
  `parserEurosSaisis`) et le parseur `parserCharges` de `apps/web/lib/charges.ts`,
  déjà partagé avec l'action d'écriture. On ne dédouble aucun calcul : un aperçu qui
  divergerait de l'écriture serait un mensonge à l'écran (CLAUDE.md). En
  particulier, la date de clôture affichée est **exactement** `veilleDe(dateDebut)`,
  la même que celle qu'écrira `cloturerEtAjouter`.
- **Le canari du solde.** L'e2e crée une version (`2026-09-01`, salaires
  `4000/1000`) et vérifie `31/08/2026` dans la timeline, puis l'invariance du solde.
  On ne touche ni aux montants, ni à l'ordre des écritures, ni aux `name` des
  champs : le parcours de soumission reste identique. On **ajoute** seulement des
  assertions *avant* le clic.
- **Les tokens et la palette.** Achromatique, deux accents seulement. L'aperçu
  n'introduit aucune couleur : ancien en `text-muted-foreground`, nouveau en
  `text-strong`, filets `border-subtle`, fond `bg-muted`. Aucune classe Tailwind de
  palette en dur (verrou `theme.test.ts`).
- **Le bandeau emerald** existant reste. Il est recentré sur son seul invariant
  (« aucune dépense passée n'est touchée ») ; la partie « quelle version / quelle
  date » le quitte pour vivre dans l'aperçu, là où elle devient précise et vivante.

## La conception retenue : un aperçu de clôture vivant

Un bloc placé **juste avant le bouton « Créer la version »** — le dernier point de
lecture avant de valider, ce que demande littéralement l'issue (« avant de
valider, on voit… »). Il lit les champs déjà saisis (`libelle` implicite,
`dateDebut`, les deux salaires, les trois textareas de charges) et se recalcule à
chaque frappe, **sans appel serveur** : toutes les fonctions dont il a besoin sont
pures et exécutables côté client.

### Découpage : un helper pur, un composant mince

Toute la logique va dans un helper pur et testé, `apps/web/lib/apercu-cloture.ts` :

```ts
interface SaisieBruteVersion {
  dateDebut: string          // valeur brute du <input type="date">
  salaireNetThomas: string   // valeur brute du champ (« 4 000,00 »)
  salaireNetLiz: string
  chargesCommunes: string    // valeur brute du <textarea>
}

interface LigneCloture {
  libelle: string            // « Part Thomas », « Salaire Thomas », …
  unite: 'euros' | 'pourcent'
  avant: number              // centimes si 'euros', ratio 0–1 si 'pourcent'
  apres: number              // le composant formate : <Montant> ou Math.round(r*100)
}

interface ApercuCloture {
  // null tant qu'aucune date valide ET postérieure au début courant n'est saisie
  dateCloture: string | null // ISO, = veilleDe(dateDebut)
  lignes: LigneCloture[]      // uniquement les moteurs qui changent réellement
}

function apercuCloture(
  courante: VersionConfig,
  saisie: SaisieBruteVersion,
): ApercuCloture
```

Le composant `FormulaireVersion` garde des `useState` sur les champs concernés
(`dateDebut`, `salaireNetThomas`, `salaireNetLiz`, `chargesCommunes`), passe leurs
valeurs brutes au helper à chaque rendu, et se contente d'**afficher** le résultat.
Le calcul du `%` et le formatage des montants peuvent rester dans le composant
(via `Montant`) ; le helper renvoie alors des **valeurs en centimes / ratios**
plutôt que du texte. Choix d'implémentation laissé au plan, tant que **le composant
ne recalcule aucune règle** : il ne fait que router des nombres déjà calculés vers
`Montant` et un formatage de pourcentage.

> Nuance à trancher dans le plan : le helper renvoie-t-il du **texte déjà formaté**
> ou des **nombres bruts** (`{ avant: Cents, apres: Cents }`) que le composant passe
> à `Montant` ? On retient les **nombres bruts** : cela réutilise `Montant` (donc le
> formatage euro unique du projet) et n'oblige pas le helper à connaître `Intl`. Le
> helper renvoie donc `avant`/`apres` en centimes (montants) ou en ratio (part), et
> une étiquette d'unité (`'euros' | 'pourcent'`).

### Les moteurs du calcul (profondeur du diff, choix validé)

L'aperçu compare **seulement les quatre nombres qui pilotent la répartition** :

| Ligne | Avant | Après |
|---|---|---|
| Part Thomas | `ratioThomas(courante)` | `ratioThomas(saisie)` |
| Salaire Thomas | `courante.salaireNetThomas` | `parserEurosSaisis(saisie.salaireNetThomas)` |
| Salaire Liz | `courante.salaireNetLiz` | `parserEurosSaisis(saisie.salaireNetLiz)` |
| Charges communes | `totalChargesCommunes(courante)` | `∑ parserCharges(saisie.chargesCommunes)` |

Règles d'affichage :

- **Seules les lignes qui changent réellement** s'affichent (`avant !== après`). Une
  version qui ne modifie que le libellé et la date n'affiche aucune ligne de diff.
- **Un champ encore illisible** (saisie en cours : `parserEurosSaisis` ou
  `parserCharges` lève) **omet sa ligne** — pas d'erreur rouge, pas de `NaN`. Le
  helper enveloppe chaque parse dans un `try/catch` et traite l'échec comme
  « valeur inconnue → pas de ligne ».
- **La part Thomas** n'apparaît que si les deux salaires « après » sont lisibles et
  de somme > 0 (sinon `ratioThomas` est indéfini). Le pourcentage est arrondi à
  l'entier (`Math.round(ratio * 100)`), cohérent avec l'affichage de la timeline.
- **Aucune ligne ne change** mais une date valide est saisie : afficher une phrase
  honnête — « Aucun chiffre ne change — seule la période bascule. »

### Les états de l'aperçu

1. **`courante === null`** (première version, base fraîche) : il n'y a rien à
   clôturer. L'aperçu **ne s'affiche pas**. Le composant ne reçoit aucune version à
   fermer ; le bandeau de réassurance reste, sans la clause de clôture.
2. **Version courante, aucune date saisie** : invite discrète (`text-faint`) —
   « Choisissez une prise d'effet pour voir ce que la clôture ferme. »
3. **Version courante, date valide et postérieure au début courant** : titre
   « Clôture de « `courante.libelle` » au **JJ/MM/AAAA** » (avec
   `formaterDate(veilleDe(dateDebut))`) suivi du diff.
4. **Date saisie mais antérieure ou égale au début de la version courante**
   (`dateDebut <= courante.dateDebut`, que `cloturerEtAjouter` rejette) : on
   **n'affiche pas** de date de clôture (`dateCloture === null`) et on montre un
   rappel — « La prise d'effet doit être postérieure au `formaterDate(courante.dateDebut)`
   de la version en cours. » Cela évite d'afficher une « veille » absurde
   (antérieure au début) et prépare l'utilisateur au refus de l'action.
5. **Date syntaxiquement invalide/incomplète** (`<input type="date">` peut rendre
   `''`) : traitée comme l'état 2 (pas de date → invite).

### Esquisse visuelle (repliée dans le formulaire)

```
… (champs libellé, prise d'effet, salaires, charges) …

┌──────────────────────────────────────────────────┐
│ Clôture de « Loyer 2026 » au 31/08/2026           │  ← text-body, date en strong
│                                                    │
│ Ce qui change                                      │  ← libellé faint, uppercase léger
│   Part Thomas         62 %      →   80 %           │  ← ancien muted, flèche, nouveau strong
│   Salaire Thomas   3 300,00 €   →  4 000,00 €      │     tabular-nums, Montant
│   Salaire Liz      2 100,00 €   →  1 000,00 €      │
└──────────────────────────────────────────────────┘

[            Créer la version                      ]
```

Contenu et tokens : conteneur `rounded-lg border border-subtle bg-muted` (ou
équivalent au design system), titres en `text-body`/`text-strong`, méta en
`text-faint`, flèche `→` (U+2192) en `text-faint`. Nombres `tabular-nums`. Argent
via `<Montant>`. **Aucune couleur.**

## Tests

- **Unitaire — `apps/web/test/apercu-cloture.test.ts`** (vitest, sans Docker) :
  - date postérieure → `dateCloture === veilleDe(dateDebut)` ;
  - date égale/antérieure au début courant → `dateCloture === null` ;
  - date vide → `dateCloture === null` ;
  - un salaire changé → une seule ligne « Salaire … » + recalcul de « Part Thomas » ;
  - config identique (mêmes salaires, mêmes charges) → `lignes === []` ;
  - salaire en cours de frappe (illisible, ex. `« 4 »` seul est lisible, tester
    `« 4 000, »` ou une chaîne vide) → la ligne concernée est omise, pas d'exception ;
  - charges communes modifiées → ligne « Charges communes » avant/après cohérente
    avec `totalChargesCommunes`.
  Le canari implicite : la part et les totaux passent par **les fonctions du
  domaine**, jamais par un calcul local.

- **E2E — `apps/web/e2e/parcours.spec.ts`** (parcours existant « creer une version ») :
  après avoir rempli `dateDebut=2026-09-01` et les salaires `4000/1000`, et **avant**
  de cliquer « Créer la version », vérifier que l'aperçu contient `31/08/2026` et au
  moins une ligne modifiée (p. ex. le nouveau salaire ou la nouvelle part). Le reste
  du test (clôture au `31/08/2026`, invariance du solde) est inchangé.

- **Régression** : `theme.test.ts` (pas de couleur en dur), `architecture.test.ts`
  (le formulaire n'importe rien hors façade — l'aperçu n'ajoute aucun import de
  `@homebudget/db`, seulement `@homebudget/domain` et `@/lib/*`).

## Hors périmètre (YAGNI)

- Le diff **ligne par ligne** des charges (ajoutée/retirée/modifiée) : écarté au
  cadrage. Le détail des charges reste consultable dans la timeline à côté.
- Toute modification de l'historique/timeline de gauche.
- Toute validation serveur nouvelle : l'action `creerVersionAction` et
  `cloturerEtAjouter` gardent le dernier mot ; l'aperçu est une aide à la lecture,
  pas une garde.
