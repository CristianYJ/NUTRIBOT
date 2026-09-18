import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { postgresOptions } from "../server/postgres-config.js";
const exec = promisify(execFile);
export async function pgTool(name, args, database) {
  const config = postgresOptions();
  const directory =
    process.env.PGBIN ||
    (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const absolute = directory
    ? path.join(directory, name + (process.platform === "win32" ? ".exe" : ""))
    : "";
  const executable = absolute && existsSync(absolute) ? absolute : name;
  // Credentials travel in the child environment, never command arguments or logs.
  try {
    return await exec(executable, args, {
      env: {
        ...process.env,
        PGHOST: config.host,
        PGPORT: String(config.port),
        PGUSER: config.user,
        PGPASSWORD: config.password,
        PGDATABASE: database || config.database,
      },
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error(
      `No se pudo ejecutar ${name}. Comprueba PGBIN, la conexión y los permisos.`,
    );
  }
}
