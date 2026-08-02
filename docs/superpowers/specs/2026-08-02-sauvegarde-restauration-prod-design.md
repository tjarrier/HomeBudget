# Sauvegarde et restauration de la base de production

**Issue :** [#42](https://github.com/tjarrier/HomeBudget/issues/42)
**Date :** 2026-08-02

## Le problème

Une seule instance Postgres, sur une offre gratuite, et tout l'historique financier
du couple dedans. Le contenu n'est pas reconstituable : le Sheet d'origine s'arrête
au 12/07/2026, et les dépenses saisies depuis n'existent nulle part ailleurs.

L'issue nomme deux choses distinctes et dit laquelle compte : savoir qu'une
sauvegarde existe, et **avoir déjà restauré une fois pour de vrai**. Une sauvegarde
jamais restaurée est une hypothèse, pas une garantie.

## La décision qui commande tout : le dépôt est public

`tjarrier/HomeBudget` est public. Les artefacts d'un dépôt public sont téléchargeables
par n'importe qui. Un `pg_dump` brut posé en artefact publierait donc l'intégralité
des dépenses du couple sur une URL ouverte.

Tout le reste en découle : le dump est **chiffré avant de sortir du runner**, jamais
après, et l'artefact ne contient que du chiffré.

## Ce qu'on sauvegarde

    pg_dump --schema=public --schema=drizzle --no-owner --no-privileges

- **`drizzle` n'est pas décoratif.** C'est le schéma où Drizzle tient le journal des
  migrations (`drizzle.__drizzle_migrations`). Un dump qui ne prendrait que `public`
  produirait une base restaurée qui *croit n'avoir jamais migré* : le prochain
  `db:migrate` rejouerait les huit migrations sur un schéma déjà en place, et
  s'arrêterait sur la première table existante. La base serait là, la chaîne de
  déploiement, elle, serait cassée.
- **`--no-owner --no-privileges`** : les rôles de Supabase n'existent pas sur le
  Postgres local ni dans le conteneur du runner. Sans ces deux drapeaux, la
  restauration échoue sur des `ALTER ... OWNER TO` désignant des rôles absents.
- **Pas de `--clean`.** Un dump lâché par erreur sur une base peuplée doit échouer
  bruyamment, pas écraser. C'est un choix de drapeau qui remplace un garde-fou :
  rien à écrire, rien à maintenir.
- **`pg_dump` vient de `docker run --rm postgres:17-alpine`.** Le client doit être
  d'une version au moins égale à celle du serveur, et l'image fige ça une fois pour
  toutes — sur le runner comme sur le poste. `ubuntu-latest` embarque un
  `postgresql-client` plus ancien, qui refuserait de dumper.

## Où atterrit la sauvegarde

`homebudget-<AAAA-MM-JJ>.sql.gz.gpg`, artefact du run, rétention 90 jours (le
maximum), chiffré en AES256 par `gpg --symmetric` avec la passphrase du secret
d'environment `BACKUP_PASSPHRASE` (environment `Production`, à créer à la main).

**La passphrase doit vivre dans le gestionnaire de mots de passe de Thomas.** Une
sauvegarde qu'on ne sait plus déchiffrer n'est pas une sauvegarde — et le secret
GitHub ne se relit pas.

Effet de bord gratuit et bienvenu : un dump quotidien compte comme activité, donc le
projet Supabase gratuit ne se met plus en pause au bout d'une semaine d'inactivité.

## Le cœur : rien n'est publié sans avoir été restauré

Le workflow ne suppose jamais qu'un dump est restaurable. Il le restaure, à chaque
run, avant de publier quoi que ce soit. L'ordre :

1. `pg_dump` de la production ;
2. `gzip`, puis `gpg --symmetric` ;
3. **déchiffrement, restauration dans un Postgres vierge du run** (service
   `postgres:17-alpine`, celui-là même que la CI utilise déjà) ;
4. **comparaison d'empreinte** entre la production et la copie restaurée ;
5. publication de l'artefact — et seulement si l'étape 4 est exacte.

La restauration tourne en `psql -v ON_ERROR_STOP=1 --single-transaction` : la
première erreur annule tout. Sans `ON_ERROR_STOP`, `psql` continue après un
`CREATE TABLE` en échec et charge quand même les `COPY` — c'est le chemin qui
duplique des lignes en silence.

### L'empreinte

Un seul fichier `.sql`, joué des deux côtés, dont la sortie est comparée par `diff` :

- le compte de lignes de **chaque** table de `public` et `drizzle` (obtenu par
  `query_to_xml` sur `information_schema.tables`, faute de pouvoir compter des tables
  inconnues autrement) ;
- `count(*), sum(part_thomas), sum(part_liz)` sur `depense`.

C'est ce qui distingue « la commande est sortie en 0 » de « les données sont
passées » — la leçon du run de déploiement qui s'est déclaré vert sans rien écrire.
Un dump vide se restaure parfaitement.

Cette empreinte attrape aussi le mode de défaillance qui n'apparaîtrait que des mois
plus tard : une table ou un schéma ajouté après coup, que la liste `--schema` ne
couvre pas. Il manquerait dans la copie, le `diff` le dirait. C'est pour ça que
l'empreinte énumère les tables au lieu de vérifier une liste écrite à la main.

**Elle ne recalcule rien** (règle 4) : elle lit `part_thomas` et `part_liz` tels
qu'ils sont stockés et en fait une somme. Comparer une somme des deux côtés ne
suppose rien sur la façon dont elle a été obtenue.

### Déclenchement

`schedule` quotidien, plus `workflow_dispatch`. L'environment `Production` porte déjà
`DATABASE_URL` ; il portera `BACKUP_PASSPHRASE`.

Pas d'alerting à construire : GitHub envoie un mail à l'auteur quand un run planifié
échoue. À savoir, en revanche, et c'est dans le mode d'emploi : GitHub **désactive**
un workflow planifié après 60 jours sans activité sur le dépôt, avec un mail
d'avertissement avant.

## La restauration réelle

    task db:restaurer FICHIER=homebudget-2026-08-02.sql.gz.gpg

qui fait, en une ligne :

    gpg -d "$FICHIER" | gunzip | docker run --rm -i --network host \
      postgres:17-alpine psql -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL"

**C'est exactement la commande que joue le workflow.** Une seule procédure, jamais
deux : la restauration vérifiée chaque nuit est celle qu'on tapera le jour où la
production aura disparu. `--network host` fait joindre `127.0.0.1:5433` depuis le
conteneur, aussi bien sur le runner que sur le poste.

Seule différence entre les deux contextes, et elle est dans `gpg` : en local, il
demande la passphrase par son invite habituelle — donc `task db:restaurer` veut un
vrai terminal ; dans le workflow, elle arrive par `--batch --passphrase-fd 0` depuis
le secret, jamais par la ligne de commande où elle apparaîtrait dans les logs.

Aucun garde-fou supplémentaire à écrire : `assertBaseEffacable` protège le *seed*,
qui commence par un `TRUNCATE`. La restauration, elle, se protège par l'absence de
`--clean` et par `ON_ERROR_STOP` — visée sur une base peuplée, elle échoue sans rien
toucher.

### Le drill, une fois, pour de vrai

Sur le Postgres local, avec les vraies données, qui ne quittent pas le poste :

1. `task db:down` puis destruction du volume — une base réellement vierge ;
2. téléchargement de l'artefact du jour, `task db:restaurer` ;
3. `task dev`, connexion, lecture du solde à l'écran ;
4. comparaison avec le solde affiché par la production.

Le compte-rendu est commité dans `docs/` : la date, la sauvegarde utilisée, le solde
des deux côtés, et ce qui a dû être ajusté. C'est la seule preuve qui compte.

**Sur le canari à 114 580.** L'issue demande « le canari à 114 580 centimes tenant
après restauration du seed ». Si la production ne contient encore que le seed du
Sheet, le solde à l'écran *est* 114 580 et la formulation est prise au mot. Si des
dépenses ont été saisies depuis, la référence devient le solde affiché par la
production — le 114 580 reste vérifié par la CI, là où il vit encore (`db:seed`,
`facade.integration.test.ts`, `parcours.spec.ts`). Le drill vérifie que la
restauration est fidèle, pas que la production vaut une constante.

## Le risque connu, et sa parade

`pg_dump` ne fonctionne pas à travers le pooler Supabase en **mode transaction**
(port 6543) : il lui faut des fonctionnalités de session. La production est
forcément joignable par le pooler — la connexion directe de Supabase est en IPv6
seul, et les runners GitHub sont en IPv4, or `db:migrate` tourne depuis Actions.

Le workflow dérive donc l'URL en mode session : `:6543` → `:5432`, même hôte, même
utilisateur, même base. Si `DATABASE_URL` est déjà en `:5432`, la dérivation ne fait
rien. Un second secret aurait été le mauvais choix : `CLAUDE.md` pose qu'il n'y a
**qu'une source pour `DATABASE_URL`**, et deux secrets finissent toujours par
diverger. La substitution porte le commentaire qui l'explique.

C'est la seule inconnue de la conception. Elle se lèvera au premier run — et le run
le dira en rouge, avant qu'on ne dépende de quoi que ce soit.

## Ce qui est laissé dehors

- **PITR et rétention au-delà de 90 jours.** À reprendre le jour où perdre plus de
  90 jours devient inacceptable.
- **Stockage externe (R2, B2, bucket).** Écarté à l'arbitrage : un compte de plus et
  des clés de plus, pour une durabilité dont on n'a pas encore besoin.
- **Rotation de la passphrase.** Un dump chiffré reste lisible avec la passphrase de
  son époque ; changer la passphrase rend les anciens artefacts illisibles sans elle.
  Le jour où ça arrive, ça se fait à la main.
- **Restauration automatique vers une vraie instance Supabase.** Le drill local suffit
  à prouver la procédure, et écrire les données réelles sur la base de Preview les
  poserait sur un site accessible publiquement.
- **Alerting dédié.** Le mail d'échec de GitHub le fait déjà.

## Fini quand

- une sauvegarde chiffrée est produite chaque jour sans intervention ;
- chaque run la restaure sur une base vierge et compare l'empreinte — l'artefact
  n'est publié qu'à cette condition ;
- une restauration a été faite en vrai, en local, sur une base vierge, solde vérifié
  à l'écran, compte-rendu commité.
