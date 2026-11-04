<h1 align="center">Cheap Agent</h1>

<p align="center">
  <em>Your frontier model is a principal engineer. Stop paying it to type.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/cheap-agent?style=flat-square&color=111111&label=npm" alt="npm">
  <img src="https://img.shields.io/badge/for-Claude%20Code%20%7C%20Codex-111111?style=flat-square" alt="For Claude Code and Codex">
  <img src="https://img.shields.io/badge/cheap%20model-%C2%BD%C2%A2%20a%20task-111111?style=flat-square" alt="Cheap model: half a cent a task">
  <img src="https://img.shields.io/badge/tested%20on-SWE--bench%20Verified-111111?style=flat-square" alt="Tested on SWE-bench Verified">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT License">
</p>

<p align="center">
  <img src="assets/demo.gif" width="880" alt="Two real Claude Code sessions side by side, same prompt: Claude Code alone climbs to 233k Opus tokens, Claude Code with Cheap Agent stops at 132k, and the cheap model costs $0.007.">
</p>

<p align="center">
  <img src="assets/hero.svg" width="880" alt="Same feature, same prompt: Claude Code alone used 154k Opus tokens in 5 turns; with Cheap Agent 57k Opus tokens in 2 turns, 63% fewer, and the cheap model cost half a cent. Both versions pass all their tests.">
</p>

<p align="center">
  <strong>Same feature. Same prompt. 63% fewer Opus tokens.</strong><br>
  <strong>Your Claude or ChatGPT plan lasts longer. Your code still ships with tests.</strong>
</p>

<p align="center">
  ⭐ Star it, and click <strong>Watch → Custom → Releases</strong> to hear when new versions ship.
</p>

## Install (BigModel fork)

Uses the direct standard API / resource-pack endpoint `https://open.bigmodel.cn/api/paas/v4`, not Coding Plan. Requires Git, Node.js 20.11+ with npm, and Codex.

Run in a normal terminal, once per machine:

```bash
npm install -g "git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker"
cheapag login --provider bigmodel --model glm-5.3
codex plugin marketplace add Zzmes/cheap-ag --ref feat/bigmodel-worker
codex plugin add cheapag@cheap-agent-glm
```

Login prompts for the key with hidden input and saves it as the `bigmodel` provider in OpenCode's shared `~/.local/share/opencode/auth.json` (mode 600; respects `XDG_DATA_HOME`). Other saved provider entries are preserved. Login automatically imports a key from the previous `~/.config/cheapag/bigmodel.key` file if no saved BigModel credential exists. The legacy file is retained for compatibility. No export, shell startup edits, source checkout, manual build or `npm link` is needed. The global npm bin directory must be on the PATH used to launch Codex (`command -v cheapag` checks this). `BIGMODEL_API_KEY` overrides the saved key; login saves that value for future sessions. Use a GLM model ID accepted by your account with `--model`. Run `cheapag login --provider bigmodel` in a terminal to choose from the GLM menu or enter a custom ID; Enter keeps the saved model. Model changes can require renewing repository consent. Never put your key in chat, a project file or a command argument. The credential file is plain text restricted to your OS user, not an encrypted vault.

Start `codex` in a project, trust the Cheap Agent hooks, invoke `$cheapag:allow` once for that Git repository, then ask for changes normally. Authorizing a parent repository does not authorize a separate nested repository. The plugin cannot override Codex's own permission checks. Login with explicit flags configures credentials and models without a model API request; an actual research/delegate task verifies the API.

The plugin, hooks and skills run the globally installed `cheapag` directly. npm downloads dependencies and builds TypeScript once during installation. Runtime hooks, authorization and MCP startup do not invoke npm/npx or write npm caches. npm's cache may be read-only inside Codex; this is why a runtime npx command is unsuitable here. Run installation and updates in a normal terminal. `npx cheap-agent` still downloads the upstream npm package without this fork's changes.

### Migrate the previous local installation

Pull this branch in your existing checkout, then run:

```bash
bash scripts/setup-codex-bigmodel.sh
```

This reuses your key and replaces the local marketplace with a Git marketplace. Restart Codex. Existing repository consent remains subject to the selected provider and models.

### Update

```bash
npm install -g "git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker"
codex plugin marketplace upgrade cheap-agent-glm
codex plugin remove cheapag@cheap-agent-glm
codex plugin add cheapag@cheap-agent-glm
```

Restart Codex after refreshing. The distribution source is `feat/bigmodel-worker`. Git package preparation follows [npm's prepare lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/).


---

You know the principal engineer. Twenty years in. Sees the whole system at once. Costs a fortune per hour.

You would never pay them to type out a CSV exporter.

But that's exactly what happens every time your frontier model (Claude Opus, GPT-6 Astra or Sol) writes your code: the most expensive model you have, reading files, typing boilerplate, re-running tests, burning through your plan.

**Cheap Agent fixes the org chart.** Your frontier model plans and decides. A model that costs half a cent per task does the typing, in its own copy of your project, and has to prove its work with a test before anything reaches you.

## Why I built this

The idea: get **$200-plan usage out of the $100 Claude plan**, and **$50–70 worth out of the $20 plan**, with a few dollars of DeepSeek doing the typing.

I've met a lot of students, mostly in developing countries, who really want Opus for the hard problems and simply can't afford $100 a month. I wanted to find something that helps them.

This is a small effort from my side. It won't make Opus ten times cheaper. But stretching the plan you already pay for is something, and something is better than nothing.

📖 The full story (why I built it, how it works step by step, and the SWE-bench numbers): **[Cheap Agent: how I made my Claude plan last 2.2–2.7x longer](https://muaazkhan.me/blog/cheap-agent)**

## The numbers

Tested on [SWE-bench Verified](https://www.swebench.com): real bugs from real open-source projects, graded by the official harness. Same prompts in Claude Code with Opus 5.5, with and without Cheap Agent.

<p align="center">
  <img src="assets/chart.svg" width="880" alt="Opus tokens, Claude Code alone versus with Cheap Agent. Adding a feature: 154k vs 57k, 63% less, both pass all tests. 7 everyday bug fixes: 1.6M vs 655k, 59% less, 7 of 7 solved by both. 9 of the hardest bugs: 3.0M vs 1.3M, 55% less, 6 of 9 solved vs 7 of 9, with a Sonnet helper doing the leftovers.">
</p>

**What I won't hide:**
- On the very hardest bugs it solved 6 of 9 where plain Opus solved 7 (on a single run plain Opus averages about 6 too).
- On tiny jobs (a few lines, or a whole small app from nothing), Opus is already quick, so there's nothing to save.

Cheap Agent shines on the work in between: real features and real fixes in real code. That's most of your day.

## Before / after

**The ask:** *"Add monthly budgets to the expense tracker, plus a CSV export. Tests for everything."*

|  | Claude Code alone | Claude Code + Cheap Agent |
|---|---|---|
| Opus tokens | 154k | **57k** |
| Opus turns | 5 | **2** |
| Who wrote the code | Opus | a cheap model, for **$0.005** |
| Tests | 33 passing | **38 passing** |

Opus wrote one task. The cheap model did the rest, tests included.

## Built with itself

Native Windows support (36 files, +753/−278 lines) was built with Cheap Agent. Claude found the problems and wrote the plans. The cheap model wrote the code in 30 jobs for **$0.29 in total**, Sonnet helpers finished what it couldn't and read OpenCode's source to find the two Windows-only bugs, and the full test suite now passes on Linux and Windows.

## How it works

<p align="center">
  <img src="assets/flow.svg" width="880" alt="How it works: Opus writes a short task; a cheap model works in its own copy of your project, writes a test that fails, fixes the code and makes the test pass; Cheap Agent runs the tests itself and only passing work lands, uncommitted; Opus reads a ten-line result and tells you. If the cheap model can't finish, a Sonnet helper finishes the step instead of Opus.">
</p>

- **Every change is proven.** The cheap model must write a test that fails before its fix and passes after. Cheap Agent runs the tests itself; it doesn't take the model's word for it.
- **Your project stays clean.** Work happens in a private copy (a git worktree). Only passing work lands, uncommitted, so you review the diff like any other.
- **Your frontier model stays in charge,** but it's held to it: Cheap Agent's hooks stop it from quietly redoing work that already passed, or (in Claude Code) doing a failed step itself when Sonnet can.

## Commands

| Claude Code | Codex | What it does |
|---|---|---|
| `/cheapag:allow` | `$cheapag:allow` | Your OK to send this project's code to the cheap model. Once per project. |
| `/cheapag:status` | `$cheapag:status` | Recent jobs, and what the cheap model has cost you. |
| `/cheapag:hook on` | `$cheapag:hook on` | No more "I'll just do it myself": your frontier model *must* hand code changes to the cheap model. |
| `/cheapag:clean` | `$cheapag:clean` | Tidy up old job folders. |

While a job runs, Claude Code shows the worker's latest step under the tool call, and Codex shows it each time it checks in (about every 15 seconds). To follow every step in a second terminal, run `npx cheap-agent watch`.

## Settings

Optional. Put a `cheapag.json` in a project:

| Setting | Default | What it does |
|---|---|---|
| `takeover` | `"sonnet"` | Who finishes a step the cheap model couldn't: a Sonnet helper, or `"self"` (your frontier model, capped at 15 tool calls). Claude Code only; Codex finishes it itself. |
| `limits.max_turns` | `25` | The most turns the cheap model gets per step. |
| `models` | from setup | Which cheap models to use. Switch with `npx cheap-agent login --preset strongest`. |

## FAQ

**Is a half-cent model actually any good?**
On its own, no. With a written task from your frontier model, a test it has to pass, and a referee that runs that test, yes, most of the time. When it isn't, it says so and a stronger model takes over.

**Does my frontier model check the work?**
The tests check the work, and Cheap Agent runs them. Opus checking every passing change cost three times the tokens and caught nothing in my runs, so it trusts a pass. You still review the diff before you commit.

**Where does my code go?**
To the provider you picked, only after you run `/cheapag:allow` (`$cheapag:allow` in Codex) in that project, which also shows exactly which models will see it. Your API key stays on your machine, in a hidden prompt and a local credential store, never in chat.

**Will it commit or push anything?**
Never. Changes land uncommitted. Your git, your call.

**Why not just use Sonnet for everything?**
Sonnet still costs real usage on every line it types. The cheap model types for half a cent. Sonnet only gets called when the cheap model is stuck.

**Can I use it at work, or build on it?**
Yes. It's MIT licensed: use it, change it, share it, at any company, for free ([MIT License](./LICENSE)).

**Why "Cheap Agent"?**
Because your plan isn't.

## Contributing

PRs are welcome, and I'm more than happy to merge them. Setup, where things live, and how to add a provider are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Update or remove

New versions are announced on the [Releases page](https://github.com/muaaz9329/cheap-ag/releases). Cheap Agent also tells you when a session starts if a new minor or major version is out; set `CHEAPAG_NO_UPDATE_CHECK=1` to turn that off.

**Update:**

```bash
npx cheap-agent@latest
```

In Codex, also:

```bash
codex plugin marketplace upgrade
```

**Remove** (two commands):

```bash
claude plugin uninstall cheapag@cheapag
```

```bash
claude mcp remove -s user cheapag
```

In Codex:

```bash
codex plugin remove cheapag@cheap-agent
```
