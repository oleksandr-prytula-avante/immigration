import fs from "node:fs/promises";
import path from "node:path";

export async function loadLocalEnv(root) {
  const envPath = path.join(root, ".env");

  try {
    const contents = await fs.readFile(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function databaseUrl() {
  const value = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Set SUPABASE_DB_URL or DATABASE_URL in .env.");
  }
  return value;
}
