#!/usr/bin/env bash
#
# Le dump de la base visee par DATABASE_URL, chiffre AVANT de toucher le disque.
#
#   scripts/sauvegarder.sh homebudget-2026-08-02.sql.gz.gpg
#
# Le depot est public, donc l'artefact d'un run est telechargeable par n'importe
# qui. Le chiffrement n'est pas une etape suivante qu'on pourrait oublier : il est
# le dernier maillon du tube, et rien d'autre que du chiffre n'est jamais ecrit.
set -euo pipefail

destination=${1:?usage: scripts/sauvegarder.sh <destination.sql.gz.gpg>}
: "${DATABASE_URL:?DATABASE_URL est absente — rien a sauvegarder}"
# Pas d'apostrophe dans ces messages : le mot de `${var:?mot}` est soumis au
# quoting, donc une apostrophe y ouvre une chaine qui avale la suite du fichier.
# Le script devient invalide, et bash ne le dit qu'a la ligne ou il abandonne —
# soixante lignes plus bas. `bash -n` sur chaque script verrouille ce piege.
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE est absente, aucun dump en clair ne sortira de cette machine}"

# `pg_dump` vient de l'image, et non du `postgresql-client` de la machine : le
# client doit etre d'une version au moins egale a celle du serveur, et
# `ubuntu-latest` en embarque un plus ancien, qui refuserait de dumper.
#
# `drizzle` n'est pas decoratif : c'est le schema ou Drizzle tient le journal des
# migrations. Un dump qui ne prendrait que `public` produirait une base restauree
# qui se croit vierge — le prochain `db:migrate` rejouerait les migrations sur un
# schema deja en place et s'arreterait sur la premiere table existante.
#
# `--no-owner --no-privileges` : les roles de Supabase n'existent ni sur le poste
# ni dans le conteneur du runner, et un `ALTER ... OWNER TO` vers un role absent
# fait echouer la restauration.
#
# Pas de `--clean` : un dump lache par erreur sur une base peuplee doit echouer
# bruyamment, pas ecraser. Un drapeau absent remplace ici un garde-fou a ecrire.
#
# `--extension=btree_gist` : les extensions n'appartiennent a aucun schema, donc
# `--schema` les exclut toutes. Verifie : la contrainte `EXCLUDE USING gist` de
# `0001` tient sans elle (l'opclass des `daterange` est dans le coeur de
# Postgres), donc rien ne casserait le jour de la restauration. Ce qui casserait
# vient plus tard : `0001` porte `create extension if not exists btree_gist` et
# le journal des migrations, restaure lui aussi, la declare deja appliquee.
# L'extension ne serait donc jamais reposee, et la premiere migration qui la
# supposerait — un `EXCLUDE` melant une colonne scalaire a une plage, ce qu'elle
# seule permet — echouerait sur la base de secours, et sur elle seule.
#
# `set -o pipefail` porte le reste : un pg_dump qui meurt en cours de tube laisse
# bien un fichier chiffre tronque sur le disque, mais il fait sortir le script en
# erreur. L'etape echoue, donc la restauration qui suit ne tourne pas et rien
# n'est publie. Sans `pipefail`, seul le code de gpg compterait : il aurait
# chiffre un dump incomplet et se serait declare content.
dump() {
  docker run --rm --network host postgres:17-alpine \
    pg_dump \
    --schema=public \
    --schema=drizzle \
    --extension=btree_gist \
    --no-owner \
    --no-privileges \
    "$DATABASE_URL"
}

# La passphrase arrive par un descripteur, jamais par la ligne de commande ou
# elle apparaitrait dans les logs du run et dans `ps`. Le fd 3 parce que stdin
# porte deja le dump.
dump | gzip | gpg \
  --batch \
  --yes \
  --quiet \
  --symmetric \
  --cipher-algo AES256 \
  --passphrase-fd 3 \
  --output "$destination" \
  3< <(printf '%s' "$BACKUP_PASSPHRASE")

echo "Sauvegarde chiffree : $destination ($(du -h "$destination" | cut -f1))"
