import { AppError } from "./recipes.js";
import { ageFromBirthDate } from "../src/date-utils.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { initialProfile } from "../src/data.js";
import { createHash, randomBytes } from "node:crypto";

const resetHash = token => createHash('sha256').update(token).digest('hex');

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
    async accountExists(value) {
      const email = normalizeEmail(value);
      const result = await pool.query("SELECT 1 FROM profiles WHERE email=$1", [
        email,
      ]);
      return result.rowCount > 0;
    },
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
    async issuePasswordReset(email, requestedByAdminId = null) {
      const normalized = normalizeEmail(email);
      return transaction(async c => {
        await c.query("DELETE FROM password_reset_tokens WHERE created_at < now() - interval '1 day'");
        const profile = (await c.query('SELECT id,email FROM profiles WHERE email=$1 FOR UPDATE', [normalized])).rows[0];
        if (!profile) return null;
        const recent = (await c.query("SELECT count(*)::integer AS n FROM password_reset_tokens WHERE profile_id=$1 AND created_at > now() - interval '1 hour'", [profile.id])).rows[0].n;
        if (recent >= 3) return null;
        const token = randomBytes(32).toString('hex');
        const tokenHash = resetHash(token);
        await c.query("UPDATE password_reset_tokens SET consumed_at=now() WHERE profile_id=$1 AND consumed_at IS NULL", [profile.id]);
        await c.query("INSERT INTO password_reset_tokens(token_hash,profile_id,requested_by_admin_id,expires_at) VALUES($1,$2,$3,now()+interval '20 minutes')",
          [tokenHash, profile.id, requestedByAdminId]);
        return { token, tokenHash, email: profile.email };
      });
    },
    cancelPasswordReset(tokenHash) {
      return pool.query('DELETE FROM password_reset_tokens WHERE token_hash=$1', [tokenHash]);
    },
    async completePasswordReset(token, newPassword) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
        throw new AppError('INVALID_RESET_LINK', 'El enlace no es válido o ya venció.', 400);
      const passwordHash = await hashPassword(newPassword);
      const tokenHash = resetHash(token);
      const candidate = (await pool.query('SELECT profile_id FROM password_reset_tokens WHERE token_hash=$1', [tokenHash])).rows[0];
      if (!candidate) throw new AppError('INVALID_RESET_LINK', 'El enlace no es válido o ya venció.', 400);
      return transaction(async c => {
        await c.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE', [candidate.profile_id]);
        const row = (await c.query(`SELECT profile_id FROM password_reset_tokens
          WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`, [tokenHash])).rows[0];
        if (!row || Number(row.profile_id) !== Number(candidate.profile_id))
          throw new AppError('INVALID_RESET_LINK', 'El enlace no es válido o ya venció.', 400);
        await c.query('UPDATE profiles SET password_hash=$1,updated_at=now() WHERE id=$2', [passwordHash, row.profile_id]);
        await c.query('UPDATE password_reset_tokens SET consumed_at=now() WHERE profile_id=$1 AND consumed_at IS NULL', [row.profile_id]);
        await c.query('DELETE FROM auth_sessions WHERE profile_id=$1', [row.profile_id]);
      });
    },
    async changePassword(profileId, oldPassword, newPassword, currentSessionHash) {
      if (oldPassword === newPassword) throw new AppError('INVALID_PASSWORD', 'Elige una contraseña nueva.');
      if (typeof currentSessionHash !== 'string' || !/^[a-f0-9]{64}$/.test(currentSessionHash))
        throw new AppError('INVALID_SESSION', 'La sesión actual no es válida.', 401);
      const passwordHash = await hashPassword(newPassword);
      return transaction(async c => {
        const row = (await c.query('SELECT password_hash FROM profiles WHERE id=$1 FOR UPDATE', [profileId])).rows[0];
        if (!await verifyPassword(oldPassword, row?.password_hash))
          throw new AppError('INVALID_CREDENTIALS', 'La contraseña actual no es correcta.', 401);
        await c.query('UPDATE profiles SET password_hash=$1,updated_at=now() WHERE id=$2', [passwordHash, profileId]);
        await c.query('UPDATE password_reset_tokens SET consumed_at=now() WHERE profile_id=$1 AND consumed_at IS NULL', [profileId]);
        await c.query('DELETE FROM auth_sessions WHERE profile_id=$1 AND token_hash<>$2', [profileId, currentSessionHash]);
      });
    },
  };
}
