# Drill de restauration — 2026-08-03

Premier passage de la procédure de bout en bout. **Sur les données du seed, pas sur
celles de la production** : la sauvegarde de production n'existera qu'au premier run
du workflow. Ce qui est prouvé ici, c'est la procédure ; ce qui reste à prouver, c'est
qu'elle rend bien les données réelles — voir « Ce que ce drill ne prouve pas ».

## Ce qui a été joué

Base source : le Postgres local du dépôt, migré (`0000`..`0007`) puis seedé aux
33 lignes réelles du Sheet.

| # | Étape | Résultat |
| --- | --- | --- |
| 1 | `docker compose down -v` puis `up` — volume détruit | base sans aucune table |
| 2 | migrations, puis seed | `Liz doit 1 145,80 € à Thomas`, solde conforme |
| 3 | `scripts/empreinte.sh` sur la source | 7 tables + les sommes |
| 4 | `scripts/sauvegarder.sh` | `homebudget-2026-08-03.sql.gz.gpg`, 6 108 octets |
| 5 | `file` sur l'artefact | `PGP symmetric key encrypted data - AES with 256-bit key, SHA512` |
| 6 | `grep` de `Courses`, `Loyer`, `thomas` dans l'artefact | 0 occurrence |
| 7 | `down -v` puis `up` — **volume réellement détruit** | 0 table dans `public` et `drizzle` |
| 8 | `scripts/restaurer.sh` | sortie 0 |
| 9 | `scripts/empreinte.sh` sur la copie, `diff` avec l'étape 3 | **identiques** |
| 10 | relecture du solde par le domaine (`resumer`) | **114 580 centimes** |
| 11 | `drizzle-kit migrate` sur la copie | 0 migration rejouée, journal à 8 |
| 12 | seconde restauration sur la base désormais peuplée | **refusée**, base intacte |

L'empreinte des deux côtés :

    table_schema,table_name,lignes
    drizzle,__drizzle_migrations,8
    public,account,0
    public,depense,33
    public,session,0
    public,user,0
    public,verification,0
    public,version_config,2

Les invariants sont revenus avec la copie, et pas seulement les données : la contrainte
`versions_sans_chevauchement`, les triggers `version_config_append_only` et
`depense_dans_sa_version`, la fonction `creer_version_config`. Une insertion de version
chevauchante a été refusée par la base restaurée — `conflicting key value violates
exclusion constraint`. Une base de secours qui aurait perdu ses garde-fous accepterait
d'écrire ce que le PRD interdit.

L'étape 11 est celle que la spec annonçait : sans le schéma `drizzle` dans le dump, la
copie se croirait vierge et le prochain `db:migrate` rejouerait les huit migrations sur
un schéma déjà en place. Le journal est là, `migrate` ne fait rien.

L'étape 12 est le garde-fou : `drop schema public` sans `cascade` échoue dès que le
schéma contient un objet, et il est dans la même transaction que le reste. Visée sur une
base peuplée, la restauration s'arrête avant d'avoir rien touché — vérifié, l'empreinte
était inchangée après le refus.

## Ce qui a dû être corrigé

Trois choses, toutes trouvées par le drill et invisibles en lecture :

1. **`pg_dump --schema=public` émet `CREATE SCHEMA public;`**, sans `IF NOT EXISTS`.
   Toute base Postgres neuve en possède déjà un : la restauration mourait aussitôt sur
   `schema "public" already exists`. `restaurer.sh` fait donc précéder le dump d'un
   `drop schema public;` en RESTRICT, dans le même flux — donc dans la même transaction.

2. **Une apostrophe dans `${VAR:?message}` rend le script invalide.** Le mot est soumis
   au quoting : l'apostrophe de « d'ici » ouvrait une chaîne qui avalait le reste du
   fichier, et bash ne le signalait qu'à la ligne 63. Un test `bash -n` sur chaque script
   verrouille ce piège — rien d'autre ne les analyse, ni `tsc` ni Biome.

3. **Les colonnes s'appellent `part_thomas_cents` et `part_liz_cents`**, pas
   `part_thomas`. L'empreinte échouait sur `column does not exist`. Elle somme aussi
   `montant_cents` désormais : le compte de lignes ne verrait pas une colonne de montants
   perdue en route.

Corrigé aussi, sans que rien n'ait cassé : `--extension=btree_gist`. Les extensions
n'appartiennent à aucun schéma, donc `--schema` les exclut. Vérifié séparément, la
contrainte `EXCLUDE USING gist` tient sans elle — l'opclass des `daterange` est dans le
cœur de Postgres. Ce qui casserait vient plus tard : le journal restauré déclare `0001`
appliquée, donc l'extension ne serait jamais reposée, et la première migration qui la
supposerait échouerait sur la base de secours, et sur elle seule.

## Ce que ce drill ne prouve pas

- **Les données de la production n'ont pas été restaurées.** La base source était le
  seed local. Le solde vérifié à l'étape 10 est donc 114 580 par construction, pas parce
  que la production vaut ce montant.
- **Le dump n'est pas passé par le pooler Supabase.** La source était un Postgres 17
  local en direct. La dérivation `:6543` → `:5432` du workflow reste la seule inconnue de
  la conception ; elle se lèvera au premier run planifié.
- **`task db:restaurer` n'a pas été joué**, seulement le script qu'il appelle. La tâche
  n'ajoute que le chargement de `.env` et la vérification que Postgres tourne.
- **`gpg` n'a pas été essayé par son invite interactive**, seulement par
  `--passphrase-fd`. C'est la seule différence entre le poste et le runner.

## Ce qui reste à faire, une fois

Le drill sur les données réelles, celui que l'issue #42 demande :

1. `BACKUP_PASSPHRASE` créée en secret du dépôt **et** dans le gestionnaire de mots de
   passe — un secret GitHub ne se relit pas ;
2. déclencher `Sauvegarde de la production` à la main, télécharger l'artefact ;
3. `task db:down`, détruire le volume, `task db:up` ;
4. `task db:restaurer FICHIER=homebudget-<date>.sql.gz.gpg` ;
5. `task dev`, se connecter, lire le solde à l'écran, le comparer à celui de la
   production.

Le compte-rendu de ce passage-là s'ajoute à côté de celui-ci.
