import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, onTestFinished, test, vi } from "vitest";
import { bigmodelKeyFile, readBigmodelKey, redact, saveBigmodelKey } from "../src/credentials.js";
import { hermeticHome, removeDir, serverEntry } from "./harness.js";

test("saved BigModel login works in a new process without exported credentials", () => {
  const { home, env } = hermeticHome();
  onTestFinished(() => removeDir(home));
  const key = "test-private-bigmodel-key.1234567890";
  const first = spawnSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel", "--model", "glm-5.3"], {
    env: { ...env, BIGMODEL_API_KEY: key }, encoding: "utf8",
  });
  expect(first.status, first.stderr).toBe(0);
  expect(first.stdout).not.toContain(key);
  const second = spawnSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel", "--model", "glm-5.3"], { env, encoding: "utf8" });
  expect(second.status, second.stderr).toBe(0);
  expect(second.stdout).not.toContain(key);
  expect(readFileSync(join(home, "config", "cheapag", "bigmodel.key"), "utf8")).toBe(key);
  expect(readFileSync(join(home, "config", "cheapag", "config.json"), "utf8")).not.toContain(key);
  if (process.platform !== "win32") expect(statSync(join(home, "config", "cheapag", "bigmodel.key")).mode & 0o777).toBe(0o600);
});

test("environment overrides a saved key, and saved secrets are redacted", () => {
  const { home } = hermeticHome();
  onTestFinished(() => { vi.unstubAllEnvs(); removeDir(home); });
  vi.stubEnv("XDG_CONFIG_HOME", join(home, "config"));
  vi.stubEnv("BIGMODEL_API_KEY", "");
  saveBigmodelKey("saved-private-key-12345678");
  expect(readBigmodelKey()).toBe("saved-private-key-12345678");
  expect(redact("error saved-private-key-12345678")).toBe("error [redacted]");
  vi.stubEnv("BIGMODEL_API_KEY", "override-private-key-12345678");
  expect(readBigmodelKey()).toBe("override-private-key-12345678");
  expect(redact("saved-private-key-12345678 override-private-key-12345678")).toBe("[redacted] [redacted]");
  expect(bigmodelKeyFile()).toBe(join(home, "config", "cheapag", "bigmodel.key"));
});
