---
name: allow
description: Opt this repository in to sending code to Cheap Agent's worker models - all models, --zdr-only (zero-retention only), or --models provider/model,...
argument-hint: "[--zdr-only | --models provider/model,...]"
disable-model-invocation: true
allowed-tools: Bash(cheapag allow) Bash(cheapag allow *)
---

!`cheapag allow $ARGUMENTS`

The user explicitly invoked this skill, so they authorized this project's consent command. If the command output appears above, report it in one line.

If no output appears above (Codex does not execute the `!` line automatically), run `cheapag allow` once in the current project, followed only by the arguments the user supplied after the skill name. Report the actual output. Do not run it merely because an MCP tool returned CONSENT. If `cheapag` is unavailable or this is not the intended project, explain that specific problem instead of claiming the user has not authorized it.
