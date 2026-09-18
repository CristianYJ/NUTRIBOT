import "./config.js";
export function postgresOptions(overrides = {}) {
  if (!process.env.PGUSER || !process.env.PGPASSWORD || !process.env.PGDATABASE)
    throw new Error(
      "Configura PostgreSQL en .env; consulta docs/POSTGRESQL.md.",
    );
  return {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 15000,
    application_name: "nutribot",
    max: 5,
    ...overrides,
  };
}
export function databaseErrorMessage(error) {
  if (error.code === "28P01" || error.code === "28000")
    return "PostgreSQL rechazó el usuario o contraseña. Revisa el archivo privado de conexión.";
  if (error.code === "3D000")
    return "No existe la base configurada. Ejecuta npm run db:provision.";
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(error.code))
    return "No se pudo conectar a PostgreSQL. Comprueba servicio, host y puerto.";
  return "No se pudo completar la operación con PostgreSQL. Revisa la configuración y ejecuta npm run db:validate.";
}
