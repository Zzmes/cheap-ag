const STATUS_SECTIONS = {
    OK: [],
    PARTIAL: ["found", "missing", "worktree"],
    FAIL: ["error", "found", "tried", "reason", "worktree"],
    BLOCKED: ["question"],
    CONFLICT: ["conflict", "worktree"],
    CANCELLED: ["reason", "worktree"],
    TIMEOUT: ["found", "reason", "missing", "worktree"],
    BUDGET: ["found", "reason", "worktree"],
};
// ticket 34: a batch block shows a settled job's action sections only (OK keeps risks:); every other status renders as today
const COMPACT_SECTIONS = {
    OK: [],
    PARTIAL: ["found", "missing", "worktree"],
    FAIL: ["error", "found", "tried", "reason", "worktree"],
};
// D6 urgency; CANCELLED is not ranked by the spec and sits with BUDGET/TIMEOUT
const URGENCY = ["BLOCKED", "CONFLICT", "FAIL", "BUDGET", "TIMEOUT", "CANCELLED", "PARTIAL", "RUNNING", "OK"];
const rank = (s) => (s === "TIMEOUT" || s === "CANCELLED" ? URGENCY.indexOf("BUDGET") : URGENCY.indexOf(s));
/** The summary a worker that never reported gets (src/worker.ts). */
export const NO_SUMMARY = "(worker gave no summary)";
const BUDGET_TOKENS = 400;
const LINE_MAX = 200;
const FULL = { changed: 15, tried: Infinity, risks: 5, review: 5, error: Infinity, summary: 160 };
/** A FAIL before any job exists (bad input, setup). */
export const failBlock = (reason) => `FAIL reason: ${reason}`;
/** A job block within `budget` tokens (chars/4), cutting in D9 order only while over it. Never cut: headline, question/options, conflict, reason, worktree, log. */
export function renderJob(r, budget = BUDGET_TOKENS, compact = false) {
    if (r.status === "RUNNING")
        return fit(`RUNNING ${r.job} step=${r.steps} turns=${r.usage.turns}`);
    let cuts = FULL;
    let text = layout(r, cuts, compact);
    const over = () => text.length / 4 > budget;
    const cut = (c) => {
        if (over())
            text = layout(r, (cuts = { ...cuts, ...c }), compact);
    };
    cut({ changed: 5 });
    cut({ tried: 1 });
    cut({ risks: 3 });
    cut({ review: 3 });
    for (let n = r.error?.length ?? 0; n > 12 && over();)
        cut({ error: --n });
    cut({ summary: 100 });
    return text;
}
function layout(r, c, compact = false) {
    const status = r.status;
    const compacted = compact && status in COMPACT_SECTIONS;
    const sections = compacted ? COMPACT_SECTIONS[status] : STATUS_SECTIONS[status];
    const has = (s) => sections.includes(s);
    // ticket 34: a compacted batch block drops summary/changed/review/log (OK's risks: survive)
    const add = r.changed.reduce((n, x) => n + x.add, 0);
    const del = r.changed.reduce((n, x) => n + x.del, 0);
    const lines = [
        [
            r.status, r.job, `step=${r.steps}`, `files=${r.changed.length}`, `+${add}/-${del}`, r.tests && `tests=${r.tests}`, r.check && `check=${r.check}`,
            `turns=${r.usage.turns}`, `cost=$${r.usage.costUsd.toFixed(3)}`,
            r.selfFix && `fix=${r.selfFix}`, r.models.escalated && "esc=1",
            r.models.final !== r.models.requested && `model=${r.models.final}`, r.redo && "redo=1", r.billing && `billing=${r.billing}`, r.repro && `repro=${r.repro}`, r.test && `test=${r.test}`,
        ].filter(Boolean).join(" "),
    ];
    const keep = new Set(); // question/options lines are never elided
    // a worker with no summary has nothing to put there: `found:` leads instead
    const lead = !compacted && r.summary === NO_SUMMARY && has("found") && r.found;
    if (lead)
        lines.push(...wrap(`found: ${oneLine(r.found)}`));
    if (!compacted && r.summary && !lead)
        lines.push(`summary: ${clip(oneLine(r.summary), c.summary)}`);
    // D5: a BLOCKED block counts its files in the headline but lists them only once the job settles
    if (!compacted && r.changed.length && r.status !== "BLOCKED") {
        lines.push("changed:", ...r.changed.slice(0, c.changed).map((x) => `  ${x.status} ${x.path}${x.add ? ` +${x.add}` : ""}${x.del ? ` -${x.del}` : ""}`));
        if (r.changed.length > c.changed)
            lines.push(`  … +${r.changed.length - c.changed} more`);
    }
    if ((!compacted || r.status === "OK") && r.risks.length)
        lines.push("risks:", ...r.risks.slice(0, c.risks).map((x) => `  - ${clip(oneLine(x), 120)}`));
    if (!compacted && r.review.length)
        lines.push(`review: ${r.review.slice(0, c.review).map((v) => `${v.path}:${v.start}-${v.end}`).join(", ")}`);
    const asked = r.questions ?? (r.question ? [r.question] : []);
    if (has("question"))
        asked.forEach((question, n) => {
            const q = [`question${asked.length > 1 ? ` ${n + 1}` : ""}: ${oneLine(question.text)}`];
            if (question.options.length)
                q.push("options:", ...question.options.slice(0, 4).map((o, i) => `  ${"abcd"[i]}) ${oneLine(o)}`));
            q.forEach((l) => keep.add(l));
            lines.push(...q);
        });
    if (has("conflict") && r.conflict?.length)
        lines.push("conflict:", ...r.conflict.map((x) => `  ${oneLine(x)}`));
    if (has("error") && r.error?.length) {
        const e = r.error.slice(0, c.error);
        if (e.length < r.error.length)
            e[e.length - 1] = `  … +${r.error.length - e.length + 1} more lines (see log)`;
        // an env failure carries the reason first, then the ordinary tail (the command and its output)
        if (r.check === "env")
            lines.push(`error: environment: the check could not run (${e[0]})`, ...e.slice(1));
        else
            lines.push(`error: ${e[0]}`, ...e.slice(1));
    }
    if (has("found") && r.found && !lead)
        lines.push(...wrap(`found: ${oneLine(r.found)}`));
    if (has("tried") && r.tried?.length)
        lines.push("tried:", ...r.tried.slice(-c.tried).map((x) => `  - ${oneLine(x)}`));
    if (has("reason") && r.reason)
        lines.push(`reason: ${oneLine(r.reason)}`);
    if (has("missing") && r.missing.length)
        lines.push("missing:", ...r.missing.map((x) => `  - ${oneLine(x)}`));
    if (has("worktree") && r.worktree)
        lines.push(`worktree: ${r.worktree}/`);
    if (!compacted)
        lines.push(`log: .cheapag/jobs/${r.job}/`);
    return lines.map((l) => (keep.has(l) ? l.replaceAll("\t", "  ") : fit(l))).join("\n");
}
/** D7. A research CONSENT renders through `renderConsent`. */
export function renderResearch(r) {
    const lines = [
        [
            r.status, r.job, `files_read=${r.filesRead}`, `turns=${r.usage.turns}`, `cost=$${r.usage.costUsd.toFixed(3)}`,
            r.models && r.models.final !== r.models.requested && `model=${r.models.final}`, r.partial && "status=partial",
        ].filter(Boolean).join(" "),
    ];
    // a scout brief (ticket 23.4): ranked files, the reproduction, dead ends, then the prose
    if (r.refs.length)
        lines.push(`files: ${r.refs.map((v) => `${v.path}:${v.start}${v.end !== v.start ? `-${v.end}` : ""}`).join(", ")}`);
    if (r.repro)
        lines.push(`repro: ${oneLine(r.repro)}`);
    if (r.deadEnds)
        lines.push(`dead ends: ${oneLine(r.deadEnds)}`);
    // prose is word-wrapped, not elided like other long lines
    if (r.answer.trim())
        lines.push("notes:", ...r.answer.trim().split("\n").flatMap((l) => wrap(l.trimEnd())));
    if (r.confidence)
        lines.push(`confidence: ${r.confidence}`);
    if (r.reason)
        lines.push(`reason: ${oneLine(r.reason)}`);
    const n = r.unlanded.length;
    if (n)
        lines.push(`note: ${n} job${n > 1 ? "s" : ""} not yet landed (${r.unlanded.join(", ")}); their changes are not visible to research`);
    lines.push(`log: .cheapag/jobs/${r.job}/`);
    return lines.map(fit).join("\n");
}
/**
 * D6: header, notes, integration error, the integration fix job's block, then job blocks by urgency (RUNNING ones as
 * adjacent single lines), then `next:`. The fix job is not a group: it counts in the cost only.
 */
export function renderBatch(b, jobs, fix) {
    const sorted = [...jobs].sort((x, y) => rank(x.status) - rank(y.status));
    const counts = URGENCY.map((s) => [s, sorted.filter((j) => j.status === s).length]).filter(([, n]) => n);
    const head = [
        [
            `BATCH ${b.batch} groups=${b.groups.length}`, ...counts.map(([s, n]) => `${s}=${n}`),
            `landed=${jobs.filter((j) => j.landed).length}`, `integration=${b.integration}`,
            `cost=$${[...jobs, ...(fix ? [fix] : [])].reduce((n, j) => n + j.usage.costUsd, 0).toFixed(3)}`,
        ].join(" "),
    ];
    if (b.notes.length)
        head.push(`note: ${b.notes.join("; ")}`);
    if (b.integrationError?.length)
        head.push(`error: ${b.integrationError[0]}`, ...b.integrationError.slice(1));
    const chunks = fix ? [renderJob(fix)] : [];
    sorted.forEach((j, i) => {
        if (j.status === "RUNNING" && sorted[i - 1]?.status === "RUNNING")
            chunks[chunks.length - 1] += `\n${renderJob(j)}`;
        else
            chunks.push(renderJob(j, BUDGET_TOKENS, true));
    });
    const blocked = sorted.find((j) => j.status === "BLOCKED");
    const next = [
        blocked && `reply(job="${blocked.job}", ...)`,
        (b.integration === "running" || sorted.some((j) => j.status === "BLOCKED" || j.status === "RUNNING")) && `jobs(action="wait", job="${b.batch}")`,
    ].filter(Boolean).join(" then ");
    // only blocks that were compacted have more to show
    const settled = sorted.filter((j) => j.status in COMPACT_SECTIONS).map((j) => j.job);
    const full = settled.length ? fit(`full blocks: jobs show ${settled.join(", ")}`) : "";
    return [head.map(fit).join("\n"), chunks.join("\n\n"), full, next && fit(`next: ${next}`)].filter(Boolean).join("\n");
}
/** D5 CONSENT: no job is created. */
export const renderConsent = (c) => [`CONSENT repo=${c.repo}`, `send: ${c.send}`, `retention: ${c.retention}`, `approve: ${c.approve}`].map(fit).join("\n");
const oneLine = (s) => s.trim().replace(/\s*\n\s*/g, " ");
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
/** A line broken at spaces into lines of at most 200 chars (a longer word is left to `fit`). */
function wrap(line) {
    const out = [""];
    for (const word of line.replaceAll("\t", "  ").split(" ")) {
        const last = out[out.length - 1];
        if (last && last.length + 1 + word.length > LINE_MAX)
            out.push(word);
        else
            out[out.length - 1] = last ? `${last} ${word}` : word;
    }
    return out;
}
/** D9 line rules: no tabs (2 spaces), at most 200 chars with the middle elided. */
function fit(line) {
    const l = line.replaceAll("\t", "  ");
    if (l.length <= LINE_MAX)
        return l;
    const half = (LINE_MAX - 1) / 2;
    return `${l.slice(0, Math.ceil(half))}…${l.slice(l.length - Math.floor(half))}`;
}
