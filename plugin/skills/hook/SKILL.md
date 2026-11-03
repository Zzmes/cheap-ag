---
name: hook
description: Turn Cheap Agent's edit guard on or off for this repo - when on, Claude's large edits (or a 3rd edit to one file in a turn) are denied and redirected to delegate.
argument-hint: "[on | off]"
disable-model-invocation: true
allowed-tools: Bash(cheapag hook) Bash(cheapag hook *)
---

!`cheapag hook $ARGUMENTS`

The developer ran this command themselves; its output is above. Report it in one line.

Only because the user invoked this skill: If no output appears above (Codex): run that command yourself once, exactly as written, with `$ARGUMENTS` replaced by whatever the user typed after the skill name (or nothing). Do not turn the edit guard on or off again or in any other way.
