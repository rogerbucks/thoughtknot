// bin/real-path-process.ts
import { readlinkSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
var NOT_THERE = /* @__PURE__ */ new Set(["ENOENT", "ENOTDIR"]);
var args = process.argv.slice(2);
try {
  const mode = args[0] === "--link" || args[0] === "--links" ? args[0] : null;
  const rest = mode ? args.slice(1) : args;
  if (rest.length !== 2 || rest[0] !== "--" || !rest[1]) throw new Error("not `-- <path>`");
  const path = rest[1];
  if (mode === "--link") {
    try {
      process.stdout.write(resolve(realpathSync.native(dirname(path)), readlinkSync(path)));
    } catch (err) {
      const code = err.code ?? "";
      if (code === "EINVAL" || NOT_THERE.has(code)) process.exitCode = 3;
      else throw err;
    }
  } else {
    try {
      process.stdout.write(mode === "--links" ? String(statSync(path).nlink) : realpathSync.native(path));
    } catch (err) {
      if (NOT_THERE.has(err.code ?? "")) process.exitCode = 2;
      else throw err;
    }
  }
} catch {
  process.exitCode = 1;
}
