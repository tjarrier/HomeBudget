# Export du Google Sheet — 2026-09-14

Source : « v2_Loyers 2025/2026 – Gestion des dépenses »
(`1FnkDamODf491K_8ejqXc56ei0iTJq6tugNbhuEpiux8`), lu via le connecteur Google Drive.

Sert à remplir la base de **recette** avec l'historique à jour. Le canari des tests
reste sur `../sheet-export-2026-07-12/`, qui ne bouge pas.

## `depenses.csv` — 38 lignes

- Les 33 premières lignes sont celles de l'export du 2026-07-12, à l'identique : le
  Sheet les affiche aux mêmes valeurs.
- 5 lignes nouvelles, d'août et de septembre 2026 (loyers v2 à 1 073,59 €,
  remboursements et virement de Liz).

**Écart avec un export verbatim :** le connecteur ne rend que les valeurs *affichées*
(`694,68 €`). Les parts flottantes des deux loyers v2 sont donc recalculées avec la
formule du Sheet, `1073.59 × 3300 / 5100 = 694.6758824`, au format de l'export
précédent. Arrondies, elles redonnent exactement l'affichage du Sheet.

Anomalies connues : les mêmes que l'export du 2026-07-12 (voir son README), traitées
au seed.

## Totaux du Sheet (onglet Résumé)

| | |
|---|---|
| Total dépenses | 25 214,54 € |
| Thomas a payé | 18 965,58 € |
| Liz a payé | 6 248,96 € |
| Thomas devrait payer | 17 961,96 € |
| Liz devrait payer | 7 252,58 € |
| **Solde Thomas** | **1 003,62 €** (« Liz doit 1003,61666034156€ à Thomas ») |

En centimes, le solde devient **100 362** : les 114 580 du canari, plus deux parts
de Liz de 378,91 € (37 891 centimes chacune), moins 900 € de remboursements et de
virement.

## Configuration

Inchangée depuis l'export du 2026-07-12 : v1 et v2, déjà dans `VERSIONS_INITIALES`.
