# Export du Google Sheet — 2026-07-12

Source : « v2_Loyers 2025/2026 – Gestion des dépenses »
(`1FnkDamODf491K_8ejqXc56ei0iTJq6tugNbhuEpiux8`)

Ces fichiers sont l'**état verbatim** du Sheet au moment de la reprise. Ils ne sont
pas modifiés : c'est la source de vérité à laquelle comparer le seed. Les
corrections (date aberrante, reclassement des transferts, arrondi au centime)
sont appliquées par le script de seed, pas ici.

## `depenses.csv` — 33 lignes

Montants en euros, **flottants pleins** tels que calculés par le Sheet
(`718.6105882`, pas `718.61`). Le seed les arrondit au centime.

Anomalies connues, traitées au seed :

- Ligne 5 : date `2029-09-29` → coquille pour `2025-09-29`.
- Le type « Transfert » n'existe pas ici ; virements et remboursements sont
  typés « Courante ». Le seed les reclasse.
- La ligne du `2026-07-05` est à `1 110,58 €` alors que la config v2 (en vigueur
  depuis le 01/07/2026) donne `1 073,59 €`. **Importée telle quelle** : c'est ce
  qui a réellement été payé. C'est précisément le bug que l'app supprime.

## Totaux du Sheet (onglet Résumé)

| | |
|---|---|
| Total dépenses | 22 167,35516 € |
| Thomas a payé | 16 818,39516 € |
| Liz a payé | 5 348,96 € |
| Thomas devrait payer | 15 672,60674 € |
| Liz devrait payer | 6 494,748425 € |
| **Solde Thomas** | **1 145,788425 €** |

Après arrondi au centime, le solde exact devient **1 145,80 €** (114 580 centimes).
Voir le §9 de la spec pour l'explication de l'écart d'un centime.

## Configuration (onglet Configuration)

Salaires : Thomas 3 300 €, Liz 1 800 € → part Thomas 64,7058…%, part Liz 35,2941…%.

| Charge commune | v1 (01/07/2025) | v2 (01/07/2026) |
|---|---|---|
| Loyer | 785,00 € | 791,00 € |
| Charges locatives | 35,00 € | 35,00 € |
| Assurance habitation | 19,59 € | 19,59 € |
| Eau | 30,00 € | 30,00 € |
| Élec + gaz | 169,00 € | 120,00 € |
| Internet | 35,99 € | 30,00 € |
| Salle de sport | 36,00 € | 36,00 € |
| Entretien chaudière | — | 12,00 € |
| **Total** | **1 110,58 €** | **1 073,59 €** |

Charges perso Thomas (v1, total 346,24 €) : frais CB 18 €, mobile 16,99 €,
coaching 120 €, assurances véhicule 54,26 €, outils IA 117 €, Zwift 19,99 €.
Charges perso Liz : mobile 15,99 €.
