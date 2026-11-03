#!/usr/bin/env bash
set -euo pipefail
for tool in node npm codex; do
  command -v "$tool" >/dev/null || { printf 'Install %s first.\n' "$tool" >&2; exit 1; }
done
npm install -g "git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker"
cheapag login --provider bigmodel --model "${1:-glm-5.3}"
codex plugin remove cheapag@cheap-agent >/dev/null 2>&1 || true
codex mcp remove cheapag >/dev/null 2>&1 || true
codex plugin remove cheapag@cheap-agent-glm >/dev/null 2>&1 || true
codex plugin marketplace remove cheap-agent-glm >/dev/null 2>&1 || true
codex plugin marketplace add Zzmes/cheap-ag --ref feat/bigmodel-worker
codex plugin add cheapag@cheap-agent-glm
printf '\nReady. Start a new Codex session in your project; invoke $cheapag:allow once per repository.\n'
