import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseUrl, loadLocalEnv } from "./db-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadLocalEnv(root);

const migration = path.join(root, "supabase", "migrations", "001_initial_schema.sql");
const child = spawn("psql", [databaseUrl(), "-v", "ON_ERROR_STOP=1", "-f", migration], {
  cwd: root,
  stdio: "inherit"
});

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error("psql was not found. Install PostgreSQL client tools and retry.");
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
