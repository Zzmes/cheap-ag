import { expect, test } from "vitest";
import { repositoryError } from "../src/workspace.js";

test.each(["fatal: not a git repository (or any of the parent directories): .git", "fatal: this operation must be run in a work tree"])("a genuine non-repository is classified: %s", (stderr) => {
  const err = repositoryError("/project", { status: 128, stderr: Buffer.from(stderr) });
  expect(err.reason).toBe("not-repository");
  expect(err.message).toBe("/project is not inside a git repository");
});

test.each([
  { code: "EACCES", stderr: "permission denied reading .git/config" },
  { code: "ENOENT", stderr: "" },
  { code: "EPERM", stderr: "operation not permitted" },
  { status: 128, stderr: "fatal: detected dubious ownership in repository" },
])("Git execution and access errors preserve the actual diagnostic: %j", (failure) => {
  const err = repositoryError("/project", { message: "spawnSync git failed", ...failure });
  expect(err.reason).toBe("git-failed");
  expect(err.message).toContain(failure.stderr || "spawnSync git failed");
  expect(err.message).not.toContain("not inside a git repository");
});
