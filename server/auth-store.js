import { AppError } from "./recipes.js";
import { ageFromBirthDate } from "../src/date-utils.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { initialProfile } from "../src/data.js";

export function normalizeEmail(value) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new AppError(
      "INVALID_EMAIL",
      "Introduce un correo electrónico válido.",
    );
  return value.trim().toLowerCase();
}
export function createAuthStore(pool, transaction) {
  return {
    async hasLegacyProfile() {
      return Boolean(
        (
          await pool.query(
            "SELECT 1 FROM profiles WHERE id=1 AND email IS NULL",
          )
        ).rowCount,
      );
    },
    async register(raw, canClaimLegacy) {
      const email = normalizeEmail(raw.email);
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      const birthDate = raw.birthDate || "";
      if (
        !name ||
        name.length > 35 ||
        (birthDate && ageFromBirthDate(birthDate) === null)
      )
        throw new AppError(
          "INVALID_PROFILE",
          "Revisa tu nombre y fecha de nacimiento.",
        );
      if (raw.claimLegacy === true && !canClaimLegacy)
        throw new AppError(
          "LOCAL_SETUP_ONLY",
          "Vincula los datos existentes desde la PC donde se ejecuta Nutribot.",
          403,
        );
      const passwordHash = await hashPassword(raw.password);
      return transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(72461903)");
        if (
          (await c.query("SELECT 1 FROM profiles WHERE email=$1", [email]))
            .rowCount
        )
          throw new AppError(
            "ACCOUNT_UNAVAILABLE",
            "No se pudo crear la cuenta con ese correo. Si ya tienes una, inicia sesión.",
            409,
          );
        let id;
        if (raw.claimLegacy === true) {
          const result = await c.query(
            "UPDATE profiles SET email=$1,password_hash=$2,birth_date=$3,revision=revision+1,updated_at=now() WHERE id=1 AND email IS NULL RETURNING id",
            [email, passwordHash, birthDate || null],
          );
          if (!result.rowCount)
            throw new AppError(
              "LEGACY_ALREADY_CLAIMED",
              "Los datos existentes ya tienen una cuenta. Inicia sesión o crea una cocina nueva.",
              409,
            );
          id = result.rows[0].id;
        } else {
          const result = await c.query(
            "INSERT INTO profiles(name,email,password_hash,birth_date,goal,diet) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              name,
              email,
              passwordHash,
              birthDate || null,
              initialProfile.goal,
              initialProfile.diet,
            ],
          );
          id = result.rows[0].id;
        }
        return Number(id);
      });
    },
    async login(raw) {
      let email;
      try {
        email = normalizeEmail(raw.email);
      } catch {
        email = "";
      }
      const row = (
        await pool.query(
          "SELECT id,password_hash FROM profiles WHERE email=$1",
          [email],
        )
      ).rows[0];
      if (!(await verifyPassword(raw.password, row?.password_hash)))
        throw new AppError(
          "INVALID_CREDENTIALS",
          "El correo o la contraseña no son correctos.",
          401,
        );
      return Number(row.id);
    },
    async createSession(profileId, hash, expiresAt) {
      await pool.query("DELETE FROM auth_sessions WHERE expires_at<=now()");
      await pool.query(
        "INSERT INTO auth_sessions(token_hash,profile_id,expires_at) VALUES($1,$2,$3)",
        [hash, profileId, expiresAt],
      );
    },
    async findSession(hash) {
      const row = (
        await pool.query(
          "SELECT profile_id FROM auth_sessions WHERE token_hash=$1 AND expires_at>now()",
          [hash],
        )
      ).rows[0];
      return row ? { profileId: Number(row.profile_id) } : null;
    },
    async deleteSession(hash) {
      await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hash]);
    },
  };
}
