#!/usr/bin/env bash
#
# Restaure une sauvegarde chiffree dans la base visee par DATABASE_URL.
#
#   DATABASE_URL=... scripts/restaurer.sh homebudget-2026-08-02.sql.gz.gpg
#
# Ce script est joue par le workflow de sauvegarde a chaque run ET par
# `task db:restaurer` sur le poste. Une seule procedure, jamais deux : celle
# qu'on verifie chaque nuit est celle qu'on tapera le jour ou la production aura
# disparu.
set -euo pipefail

fichier=${1:?usage: scripts/restaurer.sh <sauvegarde.sql.gz.gpg>}
: "${DATABASE_URL:?DATABASE_URL est absente — refus de deviner la base a ecrire}"

# La seule difference entre le poste et le runner tient dans ce `if`. En local,
# gpg demande la passphrase par son invite habituelle — donc `task db:restaurer`
# veut un vrai terminal. Dans le workflow, elle arrive du secret par un
# descripteur, et jamais par la ligne de commande ou elle apparaitrait en clair.
dechiffrer() {
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    gpg --batch --quiet --decrypt --passphrase-fd 3 "$fichier" \
      3< <(printf '%s' "$BACKUP_PASSPHRASE")
  else
    gpg --quiet --decrypt "$fichier"
  fi
}

# Le dump porte `CREATE SCHEMA public;` — `pg_dump` l'emet des lors que `public`
# est nomme par `--schema`, et sans `IF NOT EXISTS`. Or toute base Postgres neuve
# en possede deja un : sans cette ligne, la restauration mourrait aussitot sur
# « schema "public" already exists ». Constate au premier drill.
#
# Ce `drop` ne peut pas detruire de donnees : sans `cascade`, Postgres le refuse
# des que le schema contient le moindre objet. C'est le garde-fou qu'on n'a pas
# eu a ecrire — visee sur une base peuplee, la restauration s'arrete ici sans
# avoir touche a quoi que ce soit. Il est dans le meme flux, donc dans la meme
# transaction que le reste : si la suite echoue, le schema vide est rendu tel quel.
#
# `ON_ERROR_STOP=1 --single-transaction` : la premiere erreur annule tout. Sans
# lui, psql continue apres un `CREATE TABLE` en echec et charge quand meme les
# `COPY` — c'est le chemin qui duplique des lignes en silence.
#
# `--network host` fait joindre 127.0.0.1:5433 depuis le conteneur, sur le poste
# comme sur le runner.
{
  printf 'drop schema public;\n'
  dechiffrer | gunzip
} | docker run --rm -i --network host postgres:17-alpine \
  psql -X --quiet -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL"

echo "Restauration terminee depuis $fichier"
