import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2";
import { expect, onTestFinished, test } from "vitest";
import { opencodeBinary } from "../src/opencode.js";
import { killProcessGroup } from "../src/platform.js";
import { consentGate, writeConsent } from "../src/consent.js";
import { fullRoute, routeModels } from "../src/routing.js";
import { startFakeLlm } from "./fake-llm.js";
import { callText, hermeticHome, removeDir, serverEntry, slow, startServer } from "./harness.js";

const KEY = "bigmodel-test-id.0123456789abcdef";

async function health(version = "1.19.0") {
  const http = createServer((_, res) => res.end(JSON.stringify({ healthy: true, version })));
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => void http.close());
  return `http://127.0.0.1:${(http.address() as { port: number }).port}`;
}

test("direct BigModel login selects an optional model without writing the key; MCP uses it over an older login", async () => {
  const { home, env } = hermeticHome({ openrouter: "old-openrouter-key" });
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  const configured = execFileSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel", "--model", "glm-4.5-air"], {
    env: { ...env, BIGMODEL_API_KEY: KEY }, encoding: "utf8",
  });
  expect(configured).toContain("Worker provider: Zhipu BigModel (direct API); model glm-4.5-air");
  const userConfig = readFileSync(join(home, "config", "cheapag", "config.json"), "utf8");
  expect(userConfig).not.toContain(KEY);
  expect(JSON.parse(userConfig)).toMatchObject({
    worker_provider: "bigmodel",
    models: { implement: "bigmodel/glm-4.5-air", research: "bigmodel/glm-4.5-air", escalation: "bigmodel/glm-4.5-air", fallback: [] },
  });
  const server = await startServer({ env: { ...env, BIGMODEL_API_KEY: KEY, CHEAPAG_OPENCODE_URL: await health() } });
  onTestFinished(server.close);
  expect(await callText(server.client, "ping")).toMatch(/provider=bigmodel via=env preset=custom$/);
  const opencodeConfig = readFileSync(join(server.home, ".cheapag", "opencode", "opencode.json"), "utf8");
  expect(opencodeConfig).not.toContain(KEY);
  // ping boots with defaults; a delegate call rebuilds the config from the selected route.
  expect(JSON.parse(opencodeConfig)).toMatchObject({ small_model: "bigmodel/glm-5.3-flash" });
  const selected = fullRoute("bigmodel", JSON.parse(userConfig).models);
  expect(routeModels(selected)).toEqual([{ providerID: "bigmodel", id: "glm-4.5-air" }]);
});

test("BigModel config pins the direct endpoint, model and environment reference", async () => {
  const { home, env } = hermeticHome();
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, "config", "cheapag"), { recursive: true });
  writeFileSync(join(home, "config", "cheapag", "config.json"), JSON.stringify({ worker_provider: "bigmodel" }));
  const server = await startServer({ env: { ...env, BIGMODEL_API_KEY: KEY, CHEAPAG_OPENCODE_URL: await health() } });
  onTestFinished(server.close);
  expect(await callText(server.client, "ping")).toMatch(/provider=bigmodel via=env preset=balanced$/);
  const config = readFileSync(join(server.home, ".cheapag", "opencode", "opencode.json"), "utf8");
  expect(config).not.toContain(KEY);
  expect(JSON.parse(config)).toEqual({
    $schema: "https://opencode.ai/config.json",
    small_model: "bigmodel/glm-5.3-flash",
    provider: { bigmodel: {
      npm: "@ai-sdk/openai-compatible",
      name: "Zhipu BigModel",
      options: { baseURL: "https://open.bigmodel.cn/api/paas/v4", apiKey: "{env:BIGMODEL_API_KEY}" },
      models: { "glm-5.3-flash": { name: "glm-5.3-flash" } },
    } },
  });
  expect(routeModels(fullRoute("bigmodel"))).toEqual([{ providerID: "bigmodel", id: "glm-5.3-flash" }]);
});

test("a selected BigModel provider fails clearly when its key is missing", async () => {
  const { home, env } = hermeticHome();
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, "config", "cheapag"), { recursive: true });
  writeFileSync(join(home, "config", "cheapag", "config.json"), JSON.stringify({ worker_provider: "bigmodel" }));
  const server = await startServer({ env });
  onTestFinished(server.close);
  expect(await callText(server.client, "ping")).toContain("BIGMODEL_API_KEY is not set");
  const login = spawnSync(process.execPath, [serverEntry, "login", "--provider", "bigmodel"], { env, encoding: "utf8" });
  expect(login.status).toBe(1);
  expect(login.stdout).toContain("BIGMODEL_API_KEY is not set");
});

test("BigModel uses the normal per-repository consent gate", () => {
  const dir = mkdtempSync(join(tmpdir(), "cheapag-bigmodel-consent-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  expect(consentGate(dir, "bigmodel")).toHaveProperty("block");
  writeConsent(dir, { mode: "all", provider: "bigmodel", approvedAt: new Date().toISOString() });
  const approved = consentGate(dir, "bigmodel");
  expect("route" in approved && approved.route.implement).toEqual({ providerID: "bigmodel", id: "glm-5.3-flash" });
  writeConsent(dir, { mode: "zdr-only", provider: "bigmodel", approvedAt: new Date().toISOString() });
  expect(consentGate(dir, "bigmodel")).toMatchObject({ block: expect.stringContaining("no allowed model") });
});

test("bundled OpenCode sends a custom BigModel model and the environment key to an OpenAI-compatible endpoint", async () => {
  const llm = await startFakeLlm();
  onTestFinished(llm.close);
  const { home, env } = hermeticHome();
  const configDir = join(home, "oc");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "opencode.json"), JSON.stringify({
    small_model: "bigmodel/glm-5.3-flash",
    provider: { bigmodel: {
      npm: "@ai-sdk/openai-compatible", name: "Zhipu BigModel",
      options: { baseURL: llm.url, apiKey: "{env:BIGMODEL_API_KEY}" },
      models: { "glm-5.3-flash": { name: "glm-5.3-flash" } },
    } },
  }));
  const oc = spawn(opencodeBinary(), ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
    detached: true,
    env: { ...env, BIGMODEL_API_KEY: KEY, OPENCODE_SERVER_PASSWORD: "t", OPENCODE_CONFIG_DIR: configDir, OPENCODE_DISABLE_PROJECT_CONFIG: "1" },
  });
  oc.stderr.resume();
  const kill = () => killProcessGroup(oc.pid, "SIGKILL");
  let client: ReturnType<typeof createOpencodeClient> | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      oc.stdout.on("data", (d) => String(d).match(/(http:\/\/\S+)/) && resolve(String(d).match(/(http:\/\/\S+)/)![1]));
      oc.on("exit", (code) => reject(new Error(`OpenCode exited ${code}`)));
    });
    client = createOpencodeClient({ baseUrl: url, directory: home, headers: { authorization: `Basic ${Buffer.from("opencode:t").toString("base64")}` } });
    const { stream } = await client.event.subscribe({ directory: home });
    await stream.next();
    const session = (await client.session.create({ directory: home, model: { providerID: "bigmodel", id: "glm-5.3-flash" } })).data!;
    await client.session.promptAsync({ sessionID: session.id, directory: home, parts: [{ type: "text", text: "hi" }] });
    for await (const raw of stream) {
      const event = raw as Event;
      if (event.type === "session.idle" && event.properties.sessionID === session.id) break;
    }
    expect(llm.requests.some((body) => body.model === "glm-5.3-flash")).toBe(true);
    expect(llm.headers.some((headers) => headers.authorization === `Bearer ${KEY}`)).toBe(true);
  } finally {
    await client?.instance.dispose({ directory: home }).catch(() => {});
    kill();
    if (oc.exitCode === null) await Promise.race([new Promise((resolve) => oc.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
    try {
      removeDir(home);
    } catch (err) {
      if (process.platform !== "win32" || (err as NodeJS.ErrnoException).code !== "EPERM") throw err;
      // Windows can retain OpenCode's config handle briefly after the process exits.
    }
  }
}, slow(60_000));
