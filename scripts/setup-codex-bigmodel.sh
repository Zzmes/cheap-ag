#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"

for tool in node npm codex; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing %s on PATH. Install it, then rerun this script.\n' "$tool" >&2
    exit 1
  fi
done

key_file="$HOME/.config/cheapag/bigmodel.key"
if [[ -z ${BIGMODEL_API_KEY:-} && -s $key_file ]]; then
  BIGMODEL_API_KEY=$(<"$key_file")
fi
if [[ -z ${BIGMODEL_API_KEY:-} ]]; then
  if [[ ! -t 0 ]]; then
    printf 'Run this script in a terminal so you can enter your BigModel API key.\n' >&2
    exit 1
  fi
  read -r -s -p 'BigModel API Key: ' BIGMODEL_API_KEY
  printf '\n'
fi
if [[ -z $BIGMODEL_API_KEY ]]; then
  printf 'BigModel API Key is empty.\n' >&2
  exit 1
fi
export BIGMODEL_API_KEY

# Keep the key out of the repository, command history and Codex plugin files.
umask 077
mkdir -p -- "$(dirname -- "$key_file")"
printf '%s' "$BIGMODEL_API_KEY" > "$key_file"
chmod 600 "$key_file"
zshrc="$HOME/.zshrc"
if [[ ! -f $zshrc ]] || ! grep -Eq '^export BIGMODEL_API_KEY=.*bigmodel\.key' "$zshrc"; then
  printf '%s\n' 'export BIGMODEL_API_KEY="$(cat "$HOME/.config/cheapag/bigmodel.key")"' >> "$zshrc"
fi

npm ci --ignore-scripts
npm run build
npm link
cheapag login --provider bigmodel --model glm-5.3

# Both entries use the name cheapag; remove old ones before installing this fork.
codex plugin remove cheapag@cheap-agent >/dev/null 2>&1 || true
codex mcp remove cheapag >/dev/null 2>&1 || true
if ! codex plugin marketplace add "$repo"; then
  codex plugin marketplace upgrade cheap-agent-glm
fi
codex plugin add cheapag@cheap-agent-glm

printf '\nSetup complete. Open a new terminal, enter a project, then run codex.\n'
printf 'In each new project, run $cheapag:allow once inside Codex.\n'
