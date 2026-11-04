import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** All saved providers share OpenCode's auth store. BigModel also accepts an explicit environment override. */

/** Providers in detection order; `label` is what `cheapag login` shows. */
export const PROVIDERS = [
  { id: "opencode-go", label: "OpenCode Go" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "commandcode", label: "Command Code" },
  { id: "bigmodel", label: "Zhipu BigModel" },
] as const;

export type Provider = { provider: (typeof PROVIDERS)[number]["id"]; via: "login" | "env" };
export const BIGMODEL_KEY_ENV = "BIGMODEL_API_KEY";
/** Same credential store and provider id consumed by the bundled OpenCode. */
export const legacyBigmodelKeyFile = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "cheapag", "bigmodel.key");

function storedBigmodelKey(): string | undefined {
  try {
    const auth = JSON.parse(readFileSync(opencodeAuthFile(), "utf8"));
    return auth.bigmodel?.type === "api" && typeof auth.bigmodel.key === "string" ? auth.bigmodel.key.trim() || undefined : undefined;
  } catch { return undefined; }
}

/** The override is passed only to OpenCode's child environment, never written in a project. */
export function bigmodelKeyOverride(): string | undefined {
  if (process.env[BIGMODEL_KEY_ENV]?.trim()) return process.env[BIGMODEL_KEY_ENV]!.trim();
  if (storedBigmodelKey()) return undefined;
  try { return readFileSync(legacyBigmodelKeyFile(), "utf8").trim() || undefined; } catch { return undefined; }
}

export function readBigmodelKey(): string | undefined {
  return bigmodelKeyOverride() || storedBigmodelKey();
}

export function saveBigmodelKey(key: string) {
  const file = opencodeAuthFile();
  let saved: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      const value = JSON.parse(readFileSync(file, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      saved = value;
    } catch { throw new Error("Invalid OpenCode credential store; existing file left unchanged"); }
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ ...saved, bigmodel: { type: "api", key } }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}

export const LOGIN_COMMAND = "cheapag login";
export const NO_PROVIDER = `FAIL reason: no worker provider; run ${LOGIN_COMMAND}`;

/** OpenCode keeps logins for every installed copy in one shared file. */
export function opencodeAuthFile() {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "auth.json");
}

/** Supported providers with a saved login, in detection order. Only the provider ids are used; keys are never kept or passed on. */
export function savedProviders(): Provider["provider"][] {
  let saved: Record<string, unknown>;
  try {
    saved = existsSync(opencodeAuthFile()) ? JSON.parse(readFileSync(opencodeAuthFile(), "utf8")) : {};
  } catch {
    return []; // an unreadable auth file is the same as no login
  }
  return PROVIDERS.map((p) => p.id).filter((id) => id in saved);
}

export const providerLabel = (id: Provider["provider"]) => PROVIDERS.find((p) => p.id === id)!.label;

/** The provider the worker uses: an explicit BigModel selection, otherwise the first saved login. */
export function detectProvider(): Provider | undefined {
  // A selected BigModel provider takes precedence over old OpenCode logins. Its key never enters a project file.
  try {
    const file = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "cheapag", "config.json");
    const config = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    if (config.worker_provider === "bigmodel") return { provider: "bigmodel", via: process.env[BIGMODEL_KEY_ENV]?.trim() ? "env" : "login" };
  } catch { /* loadConfig reports a damaged config to jobs */ }
  const [first] = savedProviders();
  return first && { provider: first, via: "login" };
}

/** Strips key-shaped strings (OpenRouter's sk-or-v1-…, DeepSeek/OpenAI-style sk-…) from anything that leaves the process. */
export function redact(text: string) {
  const keys = [process.env[BIGMODEL_KEY_ENV]?.trim()];
  keys.push(storedBigmodelKey());
  try { keys.push(readFileSync(legacyBigmodelKeyFile(), "utf8").trim()); } catch {}
  let safe = text;
  for (const key of keys) if (key && key.length >= 8) safe = safe.replaceAll(key, "[redacted]");
  return safe.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted]");
}
