/** The fork is installed from GitHub until it has its own npm publication. */
export const PACKAGE_SPEC = "git+https://github.com/Zzmes/cheap-ag.git#feat/bigmodel-worker";
export const NPX_ARGS = ["-y", `--package=${PACKAGE_SPEC}`, "cheapag"];
export const NPX_COMMAND = `npx ${NPX_ARGS.join(" ")}`;
