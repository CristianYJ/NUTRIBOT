import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "./recipes.js";
const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 15 ||
    password.length > 128
  )
    throw new AppError(
      "INVALID_PASSWORD",
      "Usa una contraseña de entre 15 y 128 caracteres. Puedes usar una frase larga.",
    );
  return password;
}
export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, options);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 128) return false;
  const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
    encoded || "",
  );
  // Unknown accounts still run the same expensive derivation.
  const salt = Buffer.from(match?.[1] || "00".repeat(16), "hex");
  const expected = Buffer.from(match?.[2] || "00".repeat(64), "hex");
  const actual = await derive(password, salt, 64, options);
  return timingSafeEqual(actual, expected) && Boolean(match);
}
