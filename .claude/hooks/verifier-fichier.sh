#!/usr/bin/env bash
# Formate, lint et typecheck après chaque écriture de fichier par un agent.
# Reçoit sur stdin le JSON du hook Claude Code ; en extrait le chemin du fichier.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

fichier=$(cat | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')

# On ne réagit qu'aux sources TypeScript/JavaScript.
case "$fichier" in
  *.ts|*.tsx|*.js|*.jsx|*.json) ;;
  *) exit 0 ;;
esac
[ -f "$fichier" ] || exit 0

pnpm biome check --write "$fichier" >/dev/null 2>&1

if ! sortie=$(pnpm typecheck 2>&1); then
  # Code 2 : le message part sur stderr et remonte à l'agent, qui doit corriger.
  echo "Le typecheck echoue apres modification de $fichier :" >&2
  echo "$sortie" | tail -20 >&2
  exit 2
fi

exit 0
