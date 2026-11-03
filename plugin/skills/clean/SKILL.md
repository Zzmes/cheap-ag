---
name: clean
description: Remove Cheap Agent's old worktrees and job logs now; --all removes everything not in flight.
argument-hint: "[--all]"
disable-model-invocation: true
allowed-tools: Bash(npx -y --package=git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker cheapag clean) Bash(npx -y --package=git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker cheapag clean *)
---

!`npx -y --package=git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker cheapag clean $ARGUMENTS`

Report the result above to the user in one or two lines.

If no output appears above (Codex): run that command yourself once, exactly as written, with `$ARGUMENTS` replaced by whatever the user typed after the skill name (or nothing).
