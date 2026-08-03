#!/usr/bin/env bash
#
# Joue `empreinte.sql` sur la base passee en argument, sur la sortie standard.
#
#   scripts/empreinte.sh "$DATABASE_URL" > prod.csv
#
# Un seul point d'entree, appele deux fois par le workflow : deux invocations aux
# options differentes produiraient un `diff` qui parle de mise en forme.
set -euo pipefail

url=${1:?usage: scripts/empreinte.sh <url-postgres>}

# `-X` ignore le `.psqlrc` du poste, `--quiet` et `--csv` retirent tout ce qui
# n'est pas une donnee : sans ca, l'empreinte du poste et celle du runner
# differeraient par une bordure de tableau.
docker run --rm -i --network host postgres:17-alpine \
  psql -X --quiet --csv -v ON_ERROR_STOP=1 "$url" \
  < "$(dirname "$0")/empreinte.sql"
