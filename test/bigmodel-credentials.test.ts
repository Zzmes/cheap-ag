import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, onTestFinished, test, vi } from "vitest";
import { opencodeAuthFile, readBigmodelKey, redact, saveBigmodelKey } from "../src/credentials.js";
import { opencodeConfig } from "../src/opencode.js";
import { fullRoute } from "../src/routing.js";
import { hermeticHome, removeDir, serverEntry } from "./harness.js";

test("saved BigModel login works in a new process without exported credentials", () => {
  const { home, env } = hermeticHome({ openrouter: "other-provider-key" });
  onTestFinished(() => removeDir(home));
  const key = "test-private-bigmodel-key.1234567890";
  const first = spawnSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel", "--model", "glm-5.3"], {
    env: { ...env, BIGMODEL_API_KEY: key }, encoding: "utf8",
  });
  expect(first.status, first.stderr).toBe(0);
  expect(first.stdout).not.toContain(key);
  const second = spawnSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel", "--model", "glm-5.3-flash"], { env, encoding: "utf8" });
  expect(second.status, second.stderr).toBe(0);
  expect(second.stdout).not.toContain(key);
  expect(JSON.parse(readFileSync(join(home, "data", "opencode", "auth.json"), "utf8"))).toMatchObject({ bigmodel: { type: "api", key }, openrouter: { type: "api", key: "other-provider-key" } });
  expect(JSON.parse(readFileSync(join(home, "config", "cheapag", "config.json"), "utf8")).models.implement).toBe("bigmodel/glm-5.3-flash");
  expect(readFileSync(join(home, "config", "cheapag", "config.json"), "utf8")).not.toContain(key);
  if (process.platform !== "win32") expect(statSync(join(home, "data", "opencode", "auth.json")).mode & 0o777).toBe(0o600);
});

test("environment overrides a saved key, and saved secrets are redacted", () => {
  const { home } = hermeticHome();
  onTestFinished(() => { vi.unstubAllEnvs(); removeDir(home); });
  vi.stubEnv("XDG_CONFIG_HOME", join(home, "config"));
  vi.stubEnv("XDG_DATA_HOME", join(home, "data"));
  vi.stubEnv("BIGMODEL_API_KEY", "");
  saveBigmodelKey("saved-private-key-12345678");
  expect(readBigmodelKey()).toBe("saved-private-key-12345678");
  expect(redact("error saved-private-key-12345678")).toBe("error [redacted]");
  vi.stubEnv("BIGMODEL_API_KEY", "override-private-key-12345678");
  expect(readBigmodelKey()).toBe("override-private-key-12345678");
  expect(redact("saved-private-key-12345678 override-private-key-12345678")).toBe("[redacted] [redacted]");
  expect(opencodeAuthFile()).toBe(join(home, "data", "opencode", "auth.json"));
});

test("legacy key migrates on login without losing other providers or exposing the key", () => {
  const { home, env } = hermeticHome({ deepseek: "keep-existing-login" });
  onTestFinished(() => removeDir(home));
  const dir = join(home, "config", "cheapag");
  mkdirSync(dir, { recursive: true });
  const key = "legacy-private-key-12345678";
  writeFileSync(join(dir, "bigmodel.key"), key, { mode: 0o600 });
  const r = spawnSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel", "--model", "glm-5.3"], { env, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  expect(r.stdout).not.toContain(key);
  expect(JSON.parse(readFileSync(join(home, "data", "opencode", "auth.json"), "utf8"))).toMatchObject({ deepseek: { key: "keep-existing-login" }, bigmodel: { type: "api", key } });
});

test("a damaged shared credential store is preserved on login failure", () => {
  const { home, env } = hermeticHome({ deepseek: "existing-key" });
  onTestFinished(() => removeDir(home));
  const auth = join(home, "data", "opencode", "auth.json");
  const damaged = '{"deepseek": "secret-do-not-echo"';
  writeFileSync(auth, damaged);
  const r = spawnSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel", "--model", "glm-5.3"], { env: { ...env, BIGMODEL_API_KEY: "dummy-key-not-real-12345" }, encoding: "utf8" });
  expect(r.status).toBe(1);
  expect(readFileSync(auth, "utf8")).toBe(damaged);
  expect(r.stdout + r.stderr).not.toContain("secret-do-not-echo");
});

test("normal BigModel configuration uses OpenCode auth; only explicit overrides reference an environment key", () => {
  const { home } = hermeticHome();
  onTestFinished(() => { vi.unstubAllEnvs(); removeDir(home); });
  vi.stubEnv("XDG_CONFIG_HOME", join(home, "config"));
  vi.stubEnv("XDG_DATA_HOME", join(home, "data"));
  vi.stubEnv("BIGMODEL_API_KEY", "");
  saveBigmodelKey("stored-key-not-real-123456");
  const route = fullRoute("bigmodel", { implement: "bigmodel/glm-5.3", research: "bigmodel/glm-5.3", escalation: "bigmodel/glm-5.3", fallback: [] });
  const normal = opencodeConfig({ provider: "bigmodel", via: "login" }, route);
  expect(normal).not.toContain("apiKey");
  expect(normal).not.toContain("stored-key-not-real-123456");
  expect(JSON.parse(normal).small_model).toBe("bigmodel/glm-5.3");
  vi.stubEnv("BIGMODEL_API_KEY", "override-key-not-real-123456");
  const override = opencodeConfig({ provider: "bigmodel", via: "env" }, route);
  expect(JSON.parse(override).provider.bigmodel.options.apiKey).toBe("{env:BIGMODEL_API_KEY}");
  expect(override).not.toContain("override-key-not-real-123456");
});
