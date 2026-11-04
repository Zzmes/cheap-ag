import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { projectRoot } from "./workspace.js";
/** `cheapag watch` (ticket 46): a polling live tail of this project's jobs, one line per worker turn and the verdict. */
/** What a tool call touched, for a one-line display. Never throws on a missing or odd input. */
export function toolTarget(tool, input, base) {
    const field = (key) => {
        const value = input?.[key];
        return typeof value === "string" ? value : undefined;
    };
    if (tool === "edit" || tool === "write" || tool === "read") {
        const filePath = field("filePath") ?? "";
        return base && filePath.startsWith(base + sep) ? filePath.slice(base.length + 1) : filePath;
    }
    if (tool === "bash")
        return (field("command") ?? "").split(/\r?\n/)[0].slice(0, 40);
    return "";
}
export function watchState(root) {
    return { root, jobs: new Map() };
}
/** The directory to resolve a tool part's filePath against: the session's, when the event carries it, else the job's worktree. */
function sessionDirectory(event, part, id, root) {
    for (const value of [part?.directory, event.properties?.directory, event.directory]) {
        if (typeof value === "string" && value)
            return value;
    }
    return join(root, ".cheapag", "worktrees", id);
}
/** One poll over the job dirs under `<root>/.cheapag/jobs/`, returning the lines to print since the previous call. */
export function scan(state) {
    const base = join(state.root, ".cheapag", "jobs");
    if (!existsSync(base))
        return [];
    const lines = [];
    for (const id of readdirSync(base).sort()) {
        const dir = join(base, id);
        try {
            if (!statSync(dir).isDirectory())
                continue;
        }
        catch {
            continue;
        }
        const resultFile = join(dir, "result.txt");
        let job = state.jobs.get(dir);
        if (!job) {
            // a job that already finished before watch started is never shown; one still RUNNING (or BLOCKED) was just created
            const word = firstWord(resultFile);
            if (word && isFinal(word)) {
                state.jobs.set(dir, { offset: 0, started: true, verdict: true, skipped: true });
                continue;
            }
            job = { offset: 0, started: false, verdict: false, skipped: false };
            state.jobs.set(dir, job);
        }
        if (job.skipped)
            continue;
        if (!job.started) {
            job.started = true;
            const request = readJson(join(dir, "request.json"));
            if (request) {
                const model = typeof request.model === "string" ? request.model : undefined;
                const short = model?.split("/").pop();
                lines.push(`▶ ${id}${request.steps !== undefined ? ` · steps ${request.steps}` : ""}${short ? ` · ${short}` : ""}`);
            }
            else {
                lines.push(`▶ ${id}`);
            }
        }
        const eventsFile = join(dir, "events.jsonl");
        if (existsSync(eventsFile)) {
            const buffer = readFileSync(eventsFile);
            const text = buffer.subarray(job.offset).toString("utf8");
            const lastNewline = text.lastIndexOf("\n");
            if (lastNewline !== -1) {
                job.offset += Buffer.byteLength(text.slice(0, lastNewline + 1));
                for (const line of text.slice(0, lastNewline).split("\n")) {
                    const shown = toolLine(id, line, state.root);
                    if (shown)
                        lines.push(shown);
                }
            }
        }
        // result.txt is rewritten each turn (RUNNING …): only a final first word is the verdict
        if (!job.verdict) {
            const word = firstWord(resultFile);
            if (word && isFinal(word)) {
                job.verdict = true;
                const first = (readFileSync(resultFile, "utf8").split("\n")[0] ?? "").trimEnd();
                lines.push(`■ ${id} ${first}`);
            }
        }
    }
    return lines;
}
/** The first word of a result.txt, or undefined when the file is missing or empty. Short, so re-read every scan. */
function firstWord(file) {
    if (!existsSync(file))
        return undefined;
    try {
        return readFileSync(file, "utf8").split(/\s+/)[0] || undefined;
    }
    catch {
        return undefined;
    }
}
/** Whether a job's status is final: RUNNING and BLOCKED are the two live states. */
function isFinal(word) {
    return word !== "RUNNING" && word !== "BLOCKED";
}
/** The display line for one events.jsonl line, or undefined when it is not a finished tool part. */
function toolLine(id, line, root) {
    if (!line)
        return undefined;
    let event;
    try {
        event = JSON.parse(line);
    }
    catch {
        return undefined;
    }
    if (event?.type !== "message.part.updated")
        return undefined;
    const part = event.properties?.part;
    if (part?.type !== "tool")
        return undefined;
    const status = part.state?.status;
    if (status !== "completed" && status !== "error")
        return undefined;
    const tool = typeof part.tool === "string" ? part.tool : "";
    const target = toolTarget(tool, part.state?.input, sessionDirectory(event, part, id, root));
    return `  ${id}  ${tool}${target ? ` ${target}` : ""}${status === "error" ? " ✗" : ""}`;
}
function readJson(file) {
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    }
    catch {
        return undefined;
    }
}
/**
 * `cheapag watch <job…>`: follows the given jobs' progress.txt and result.txt, printing a line per change and then
 * each result. Returns 0 once every job is final. Used by Codex, which streams a running command's output live.
 */
export async function follow(root, ids, out = process.stdout, pollMs = 500) {
    const base = join(root, ".cheapag", "jobs");
    const printed = new Map();
    const final = new Set();
    for (;;) {
        for (const id of ids) {
            if (final.has(id))
                continue;
            const dir = join(base, id);
            if (!existsSync(dir)) {
                out.write(`✗ no job ${id}\n`);
                final.add(id);
                continue;
            }
            const progressFile = join(dir, "progress.txt");
            if (existsSync(progressFile)) {
                let line = "";
                try {
                    line = readFileSync(progressFile, "utf8").trim();
                }
                catch {
                    line = "";
                }
                if (line && line !== printed.get(id)) {
                    printed.set(id, line);
                    out.write(`  ${id}  ${line}\n`);
                }
            }
            const resultFile = join(dir, "result.txt");
            const word = firstWord(resultFile);
            if (word && word !== "RUNNING") {
                final.add(id);
                let result = "";
                try {
                    result = readFileSync(resultFile, "utf8").trim();
                }
                catch {
                    result = "";
                }
                out.write(`\n${result}\n`);
            }
        }
        if (ids.every((id) => final.has(id)))
            return 0;
        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
}
/**
 * `cheapag watch`: prints each new line of the project's job progress, polling rather than fs.watch (Windows, and
 * worktrees are removed under a watcher). Runs until Ctrl-C.
 */
export async function watch(root, out = process.stdout, pollMs = 500) {
    let project;
    try {
        project = root ?? projectRoot(process.cwd());
    }
    catch (err) {
        out.write(`✗ ${err.message}\n`);
        process.exit(1);
    }
    out.write(`watching ${join(project, ".cheapag", "jobs")} (Ctrl-C to stop)\n`);
    const state = watchState(project);
    for (;;) {
        for (const line of scan(state))
            out.write(line + "\n");
        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
}
