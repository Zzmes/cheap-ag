import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Existing providers use OpenCode's auth store; BigModel uses an environment override or private user file. */

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
export const bigmodelKeyFile = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "cheapag", "bigmodel.key");

export function readBigmodelKey(): string | undefined {
  if (process.env[BIGMODEL_KEY_ENV]?.trim()) return process.env[BIGMODEL_KEY_ENV]!.trim();
  try { return readFileSync(bigmodelKeyFile(), "utf8").trim() || undefined; } catch { return undefined; }
}

export function saveBigmodelKey(key: string) {
  const dir = join(bigmodelKeyFile(), "..");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(bigmodelKeyFile(), key, { mode: 0o600 });
  chmodSync(bigmodelKeyFile(), 0o600);
}

export const LOGIN_COMMAND = "cheapag login";
export const NO_PROVIDER = `FAIL reason: no worker provider; run ${LOGIN_COMMAND}`;

/** OpenCode keeps logins for every installed copy in one shared file. */
function authFile() {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "auth.json");
}

/** Supported providers with a saved login, in detection order. Only the provider ids are used; keys are never kept or passed on. */
export function savedProviders(): Provider["provider"][] {
  let saved: Record<string, unknown>;
  try {
    saved = existsSync(authFile()) ? JSON.parse(readFileSync(authFile(), "utf8")) : {};
  } catch {
    return []; // an unreadable auth file is the same as no login
  }
  return PROVIDERS.map((p) => p.id).filter((id) => id !== "bigmodel" && id in saved);
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
  try { keys.push(readFileSync(bigmodelKeyFile(), "utf8").trim()); } catch {}
  let safe = text;
  for (const key of keys) if (key && key.length >= 8) safe = safe.replaceAll(key, "[redacted]");
  return safe.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted]");
}
