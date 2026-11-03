---
name: status
description: Show Cheap Agent's status for this repo - running jobs, recent results, consent, and tracked spend against OpenCode Go windows.
allowed-tools: Bash(npx -y --package=git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker cheapag status)
---

!`npx -y --package=git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker cheapag status`

Show the status above to the user as is. Add a line only if something needs their action (a BLOCKED job to reply to, a missing consent, a Go window near its cap).

If no output appears above (Codex): run that command yourself once, exactly as written.
