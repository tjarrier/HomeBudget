#!/usr/bin/env bash
#
# Le dump de la base visee par DATABASE_URL, chiffre AVANT de toucher le disque —
# le chiffrement est le dernier maillon du tube, pas une etape suivante qu'on
# pourrait oublier. Pourquoi : CLAUDE.md, section « Sauvegarde ».
#
#   scripts/sauvegarder.sh homebudget-2026-08-02.sql.gz.gpg
set -euo pipefail

destination=${1:?usage: scripts/sauvegarder.sh <destination.sql.gz.gpg>}
: "${DATABASE_URL:?DATABASE_URL est absente — rien a sauvegarder}"
# Pas d'apostrophe dans le mot de `${var:?mot}` : il est soumis au quoting, donc
# une apostrophe y ouvre une chaine qui avale la suite du fichier. `bash -n` dans
# la suite unitaire verrouille ce piege — rien d'autre n'analyse ces scripts.
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE est absente, aucun dump en clair ne sortira de cette machine}"

# `pg_dump` vient de l'image : le client doit etre au moins de la version du
# serveur, et `ubuntu-latest` en embarque un plus ancien.
#
# `drizzle` porte le journal des migrations — sans lui, la copie se croit vierge.
# `--extension=btree_gist` parce que les extensions n'appartiennent a aucun
# schema : la contrainte de `0001` tient sans elle, mais le journal restaure la
# declare appliquee, donc rien ne la reposerait jamais.
#
# `--no-owner --no-privileges` : les roles de Supabase n'existent pas ailleurs, et
# un `ALTER ... OWNER TO` vers un role absent fait echouer la restauration.
#
# Pas de `--clean` : un dump lache par erreur doit echouer, pas ecraser.
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

# La passphrase arrive par un descripteur, jamais par la ligne de commande ou elle
# apparaitrait dans `ps` et dans les logs du run. Le fd 3 parce que stdin porte
# deja le dump. `pipefail` fait le reste : un `pg_dump` mort en cours de tube
# laisse un fichier tronque, mais fait sortir le script en erreur — sinon seul le
# code de gpg compterait, et il aurait chiffre un dump incomplet sans broncher.
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
