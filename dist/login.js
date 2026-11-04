import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { loadConfig, userConfigFile } from "./config.js";
import { BIGMODEL_KEY_ENV, opencodeAuthFile, readBigmodelKey, saveBigmodelKey, detectProvider, LOGIN_COMMAND as LOGIN, PROVIDERS, providerLabel as label, redact, savedProviders } from "./credentials.js";
import { ensureOpencode, opencodeBinary, stopOpencode } from "./opencode.js";
import { runCli } from "./platform.js";
import { installPlugin, stableNode } from "./install.js";
import { fullRoute, modelName, presetOf, PRESET_NAMES, PRESETS } from "./routing.js";
import { runSession } from "./worker.js";
/**
 * `cheapag login`: the setup (ADR-0004). Existing providers use OpenCode's hidden key prompt and auth store;
 * BigModel uses a hidden prompt and the same OpenCode credential store. Interactive login live-checks the selected provider and offers to register
 * the server with Claude Code at user scope and install the plugin (ticket 31). `npx cheap-agent` in a terminal runs it too.
 */
const { version } = createRequire(import.meta.url)("../package.json");
const CHECK_TIMEOUT_MS = 90_000;
const CHOICES = [...PRESET_NAMES, "custom"];
const isChoice = (s) => CHOICES.includes(s);
export async function login(args = [], { setup = false } = {}) {
    const out = (line = "") => process.stdout.write(redact(line) + "\n");
    if (args[0] === "--provider" || args.includes("--model")) {
        if (args[0] !== "--provider" || args[1] !== "bigmodel" || (args.length !== 2 && !(args.length === 4 && args[2] === "--model"))) {
            out("✗ usage: cheapag login --provider bigmodel [--model <GLM-model-ID>]");
            return 1;
        }
        return loginBigmodel(args[3] ?? (process.stdin.isTTY ? await chooseBigmodel(out) : currentBigmodel()), out);
    }
    const flag = args.length === 2 && args[0] === "--preset" ? args[1] : undefined;
    if (args.length && flag === undefined) {
        out(`✗ usage: cheapag login [--preset ${CHOICES.join("|")}]`);
        return 1;
    }
    if (flag !== undefined && !isChoice(flag)) {
        out(`✗ "${flag}" is not a preset; use one of ${CHOICES.join(", ")}; nothing changed`);
        return 1;
    }
    // `npx cheap-agent` with a login already saved is just an update: no questions, no key prompt
    if (setup && flag === undefined) {
        const saved = detectProvider();
        if (saved) {
            out(`Cheap Agent ${version} · already set up with ${label(saved.provider)} (${currentPreset(saved.provider) ?? "custom"})`);
            const code = await register(out, true);
            out(`Restart Claude Code to load it. To change provider or models: ${LOGIN}`);
            return code;
        }
    }
    if (!process.stdin.isTTY) {
        const saved = detectProvider();
        if (!saved) {
            out(`✗ ${LOGIN} needs an interactive terminal (the key is typed into a hidden prompt)`);
            return 1;
        }
        if (saved.provider === "bigmodel") {
            if (flag && flag !== "custom") {
                out(`✗ BigModel uses a model ID; run ${LOGIN} --provider bigmodel --model <GLM-model-ID>`);
                return 1;
            }
            out(`BigModel remains selected; run ${LOGIN} --provider bigmodel --model <GLM-model-ID> to change its model`);
            return 0;
        }
        // no terminal to type a key into: only the worker models are set, for the provider already logged in (scripts, the benchmark)
        const choice = flag ?? currentPreset(saved.provider) ?? "balanced";
        if (!flag)
            out(`No terminal to ask in: worker models stay ${choice} for ${label(saved.provider)}; pass --preset to choose`);
        return savePreset(saved.provider, choice, out) ? 0 : 1;
    }
    // the live check's OpenCode runs in its own process group; take it down on Ctrl-C too
    process.on("exit", () => stopOpencode(true));
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
        process.on(signal, () => process.exit(130));
    out("Cheap Agent login");
    const current = detectProvider();
    if (current)
        out(`Currently using: ${label(current.provider)}. Logging in again replaces or adds a provider.`);
    PROVIDERS.forEach((p, i) => out(`  ${i + 1}) ${p.label}`));
    const answer = await ask(`Provider [1-${PROVIDERS.length}]: `);
    const picked = PROVIDERS[Number(answer) - 1];
    if (!picked) {
        out(`✗ "${answer}" is not one of 1-${PROVIDERS.length}; nothing changed`);
        return 1;
    }
    if (picked.id === "bigmodel") {
        return loginBigmodel(await chooseBigmodel(out), out, true);
    }
    const preset = currentPreset(picked.id) ?? "balanced";
    let choice = flag ?? "";
    if (flag === undefined) {
        out("Worker models:");
        CHOICES.forEach((name, i) => out(`  ${i + 1}) ${name}${name === "balanced" ? " (recommended)" : name === "custom" ? " (set models yourself in cheapag.json)" : ""}`));
        const answer = await ask(`Models [1-${CHOICES.length}, Enter = ${preset}]: `);
        choice = answer ? (CHOICES[Number(answer) - 1] ?? answer) : preset;
    }
    if (!isChoice(choice)) {
        out(`✗ "${choice}" is not one of ${CHOICES.join(", ")}; nothing changed`);
        return 1;
    }
    // the bundled OpenCode prompts for the key with hidden input and saves it in its own credential store
    const saved = spawnSync(opencodeBinary(), ["auth", "login", "--provider", picked.id], { stdio: "inherit" });
    if (saved.status !== 0 || !savedProviders().includes(picked.id)) {
        out(`✗ ${picked.label} login was not saved; run ${LOGIN} to try again`);
        return 1;
    }
    if (!savePreset(picked.id, choice, out))
        return 1;
    const provider = { provider: picked.id, via: "login" };
    const check = await liveCheck(provider);
    out(check.ok ? `✓ ${check.line}` : `✗ ${check.line}`);
    if (!check.ok) {
        const hint = regionHint(check.line);
        if (hint)
            out(hint);
    }
    const active = detectProvider();
    if (active.provider !== provider.provider)
        out(`Note: ${label(active.provider)} is also saved and is used first.`);
    if (!check.ok)
        return 1; // the login stays saved; fix the cause and run login again
    await register(out);
    return 0;
}
/** The user-level config as written, so saving a preset keeps its other keys; {} when there is none. */
function readUser() {
    const file = userConfigFile();
    if (!existsSync(file))
        return {};
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("must hold a JSON object");
    return value;
}
/** The preset the user's config holds, when it sets `models` (Enter keeps it); a damaged file counts as none. */
function currentPreset(provider) {
    try {
        const { models } = readUser();
        return models ? presetOf(provider, models) : undefined;
    }
    catch {
        return undefined;
    }
}
/** Writes the preset as the user config's `models`, other keys kept; custom writes nothing. */
function savePreset(provider, choice, out) {
    const file = userConfigFile();
    if (choice === "custom") {
        if (provider !== "bigmodel")
            clearBigmodelSelection();
        out(`Worker models: custom, nothing written; set "models" in a repo's cheapag.json, or in ${file} for every repo`);
        return true;
    }
    try {
        const config = { ...readUser(), models: PRESETS[provider][choice] };
        if (provider !== "bigmodel")
            delete config.worker_provider;
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    }
    catch (err) {
        out(`✗ ${file}: ${err.message}; worker models not saved`);
        return false;
    }
    out(`✓ Worker models: ${choice} (implement ${PRESETS[provider][choice].implement}), saved in ${file}`);
    return true;
}
function clearBigmodelSelection() {
    const config = readUser();
    if (config.worker_provider !== "bigmodel")
        return;
    delete config.worker_provider;
    writeFileSync(userConfigFile(), JSON.stringify(config, null, 2) + "\n");
}
/** Keep a saved GLM choice when rerunning login; these examples do not assert account availability. */
function currentBigmodel() {
    try {
        const model = readUser().models?.implement;
        if (model?.startsWith("bigmodel/"))
            return model.slice("bigmodel/".length);
    }
    catch { }
    return "glm-5.3";
}
async function chooseBigmodel(out) {
    const current = currentBigmodel();
    out("GLM models (availability depends on your BigModel account):");
    out("  1) glm-5.3");
    out("  2) glm-5.3-flash");
    out("  3) custom model ID");
    const picked = await ask(`Model [1-3 or model ID, Enter = ${current}]: `);
    if (picked === "3")
        return ask("GLM model ID: ");
    return { "1": "glm-5.3", "2": "glm-5.3-flash" }[picked] ?? (picked || current);
}
async function loginBigmodel(model, out, interactive = false) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) {
        out(`✗ invalid BigModel model ID; use letters, digits, dots, underscores or hyphens`);
        return 1;
    }
    let key = readBigmodelKey();
    if (!key && process.stdin.isTTY) {
        const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
        const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
        const cancel = new AbortController();
        rl.on("SIGINT", () => cancel.abort());
        rl.on("close", () => cancel.abort());
        process.stdout.write("BigModel API Key (hidden): ");
        try {
            key = (await rl.question("", { signal: cancel.signal })).trim();
        }
        catch {
            return 1;
        }
        finally {
            rl.close();
            process.stdout.write("\n");
        }
    }
    if (!key) {
        out(`✗ ${BIGMODEL_KEY_ENV} is not set; set it in this terminal, then run ${LOGIN} --provider bigmodel --model ${model}`);
        return 1;
    }
    const file = userConfigFile();
    try {
        saveBigmodelKey(key);
        const selected = `bigmodel/${model}`;
        const config = { ...readUser(), worker_provider: "bigmodel", models: { implement: selected, research: selected, escalation: selected, fallback: [] } };
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    }
    catch (err) {
        out(`✗ ${file}: ${err.message}; BigModel not selected`);
        return 1;
    }
    out(`✓ Worker provider: Zhipu BigModel (direct API); model ${model}, saved in ${file}; key saved in OpenCode credential store ${opencodeAuthFile()}`);
    if (!interactive)
        return 0;
    const check = await liveCheck({ provider: "bigmodel", via: "env" });
    out(check.ok ? `✓ ${check.line}` : `✗ ${check.line}`);
    if (!check.ok)
        return 1;
    await register(out);
    return 0;
}
/** One tiny real call to the implement model the user's config now picks, through the bundled OpenCode, in a throwaway directory. */
async function liveCheck(provider) {
    const dir = mkdtempSync(join(tmpdir(), "cheapag-login-"));
    let name = provider.provider;
    let timer;
    try {
        // the throwaway dir has no cheapag.json, so this is the user's config alone
        const route = fullRoute(provider.provider, loadConfig(dir).models);
        const model = route.implement;
        name = modelName(model);
        // with the route, OpenCode's config pins this model too (on OpenRouter: data collection denied)
        const run = ensureOpencode(provider, dir, route).then((opencode) => runSession({
            opencode,
            directory: dir,
            model: { providerID: model.providerID, id: model.id },
            prompt: "Live check: reply with the single word OK. Do not use any tools.",
            onEvent: () => { },
        }));
        // covers boot as well as the answer; on timeout, stopping OpenCode below ends the session, and login exits
        const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("no answer within 90s")), CHECK_TIMEOUT_MS)));
        const result = await Promise.race([run, timeout]);
        if (result.error)
            return { ok: false, line: explain(result.error, name) };
        return { ok: true, line: `${name} answered (cost $${result.usage.costUsd.toFixed(4)})` };
    }
    catch (err) {
        return { ok: false, line: explain(err.message, name) };
    }
    finally {
        clearTimeout(timer);
        stopOpencode();
        rmSync(dir, { recursive: true, force: true });
    }
}
/** The fix for OpenCode Go's Global-region error, when the live check hit it. */
export function regionHint(line) {
    if (!line.includes("requires Global regions"))
        return undefined;
    return "  Fix: in the OpenCode console (opencode.ai), Settings → Privacy → Regions → Global; or pick a model that does not need it (e.g. opencode-go/glm-5.3-flash) with --preset custom.";
}
/** A one-line reason and fix for the common live-check failures. */
function explain(message, model) {
    const first = message.split("\n")[0];
    if (/\b401\b|unauthori[sz]ed|authentication|invalid.*key|api key/i.test(message))
        return `the key was rejected (${first}); run ${LOGIN} again with the right key`;
    if (/\b402\b|credit|insufficient|balance|quota/i.test(message))
        return `the account has no credit (${first}); top it up, then run ${LOGIN} again`;
    if (/\b404\b|not found|no endpoints|not available/i.test(message))
        return `${model} is unavailable to this account (${first}); run ${LOGIN} and pick another provider`;
    return `live check failed: ${first}`;
}
/**
 * Offers user-scope registration with Claude Code, then the plugin; prints the commands whenever it does not run them.
 * On an update, the plugin line says it was updated and the fresh-install closing line is left to the caller.
 */
async function register(out, update = false) {
    const done = () => {
        const plugin = installPlugin(out, { update });
        if (!update)
            finish(out, plugin);
    };
    const command = serverCommand();
    const manual = `claude mcp add -s user cheapag -- ${command.map(quote).join(" ")}`;
    const remove = "claude mcp remove cheapag -s user";
    const existing = runCli("claude", ["mcp", "get", "cheapag"], { encoding: "utf8" });
    if (!existing) {
        out(`Claude Code's CLI was not found. To add cheapag for all your projects, run:\n  ${manual}`);
        return 0;
    }
    // only a user-scope entry counts: a local or project one doesn't cover "all your projects"
    if (existing.status === 0 && /Scope:\s*User/i.test(existing.stdout)) {
        if (sameCommand(registeredCommand(existing.stdout), command)) {
            out("✓ cheapag is already registered with Claude Code");
            done();
            return 0;
        }
        // an older version or path would keep running the old server: replace it without asking
        const removed = runCli("claude", ["mcp", "remove", "cheapag", "-s", "user"], { encoding: "utf8" });
        const added = removed?.status === 0 ? runCli("claude", ["mcp", "add", "-s", "user", "cheapag", "--", ...command], { encoding: "utf8" }) : undefined;
        if (removed?.status !== 0 || added?.status !== 0) {
            const failed = removed?.status === 0 ? added : removed;
            out(`✗ claude mcp update failed (${((failed?.stderr || failed?.stdout) ?? "").trim().split("\n")[0]}). Run it yourself:\n  ${remove}\n  ${manual}`);
            done();
            return 1;
        }
        out(`✓ Updated cheapag's server in Claude Code to ${version}`);
        done();
        return 0;
    }
    if (/^n/i.test(await ask("Add cheapag to Claude Code for all your projects? [Y/n] "))) {
        out(`Not registered. To add it later, run:\n  ${manual}`);
        return 0;
    }
    const added = runCli("claude", ["mcp", "add", "-s", "user", "cheapag", "--", ...command], { encoding: "utf8" });
    if (!added || added.status !== 0) {
        out(`✗ claude mcp add failed (${((added?.stderr || added?.stdout) ?? "").trim().split("\n")[0]}). Run it yourself:\n  ${manual}`);
        return 1;
    }
    out("✓ Added cheapag to Claude Code for all your projects");
    done();
    return 0;
}
/** The executable and arguments `claude mcp get cheapag` reports for the entry, or undefined when it shows neither. */
function registeredCommand(stdout) {
    const command = /^\s*Command:\s*(.*?)\s*$/m.exec(stdout)?.[1];
    if (command === undefined)
        return undefined;
    const args = /^\s*Args:\s*(.*?)\s*$/m.exec(stdout)?.[1];
    return [command, ...(args ? args.split(/\s+/).filter(Boolean) : [])];
}
function sameCommand(existing, current) {
    return existing !== undefined && existing.length === current.length && existing.every((arg, i) => arg === current[i]);
}
/** The last thing setup says: how to start. */
function finish(out, plugin) {
    out(plugin
        ? "\nDone. Open a new Claude Code session in your project and run /cheapag:allow once there; then ask for changes as usual."
        : "\nThe server is set up; add the plugin with the commands above, then open a new Claude Code session.");
}
/** How Claude Code starts this installed package without a package-manager invocation. */
function serverCommand() {
    const entry = realpathSync(process.argv[1]);
    return [stableNode(), entry];
}
// double quotes on Windows: cmd and PowerShell don't treat single quotes as quoting
const quote = (arg) => /^[\w@%+=:,./-]+$/.test(arg) ? arg : process.platform === "win32" ? `"${arg.replace(/"/g, '\\"')}"` : `'${arg.replace(/'/g, `'\\''`)}'`;
/** One question on a fresh readline, closed before anything else (OpenCode's login) reads the terminal. */
async function ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await rl.question(question)).trim();
    }
    finally {
        rl.close();
    }
}
