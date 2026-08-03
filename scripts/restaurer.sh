#!/usr/bin/env bash
#
# Restaure une sauvegarde chiffree dans la base visee par DATABASE_URL. Joue par
# le workflow de sauvegarde a chaque run ET par `task db:restaurer` : une seule
# procedure, celle qu'on verifie chaque nuit est celle qu'on tapera le jour ou la
# production aura disparu.
#
#   DATABASE_URL=... scripts/restaurer.sh homebudget-2026-08-02.sql.gz.gpg
set -euo pipefail

fichier=${1:?usage: scripts/restaurer.sh <sauvegarde.sql.gz.gpg>}
: "${DATABASE_URL:?DATABASE_URL est absente — refus de deviner la base a ecrire}"

# La seule difference entre le poste et le runner tient dans ce `if` : invite
# interactive de gpg en local (donc `task db:restaurer` veut un vrai terminal),
# passphrase par descripteur dans le workflow.
dechiffrer() {
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    gpg --batch --quiet --decrypt --passphrase-fd 3 "$fichier" \
      3< <(printf '%s' "$BACKUP_PASSPHRASE")
  else
    gpg --quiet --decrypt "$fichier"
  fi
}

# Le dump porte `CREATE SCHEMA public;` sans `IF NOT EXISTS` — `pg_dump` l'emet des
# lors que `public` est nomme par `--schema` — et toute base neuve en a deja un :
# sans ce `drop`, la restauration meurt aussitot. Constate au premier drill.
#
# En RESTRICT, jamais `cascade` : Postgres le refuse des que le schema contient un
# objet, donc visee sur une base peuplee la restauration s'arrete ici sans rien
# toucher. C'est le garde-fou qu'on n'a pas eu a ecrire.
#
# `ON_ERROR_STOP=1 --single-transaction` : la premiere erreur annule tout, `drop`
# compris. Sans lui, psql continue apres un `CREATE TABLE` en echec et charge les
# `COPY` quand meme — le chemin qui duplique des lignes en silence.
{
  printf 'drop schema public;\n'
  dechiffrer | gunzip
} | docker run --rm -i --network host postgres:17-alpine \
  psql -X --quiet -v ON_ERROR_STOP=1 --single-transaction "$DATABASE_URL"

echo "Restauration terminee depuis $fichier"
