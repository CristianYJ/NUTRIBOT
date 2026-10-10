import { AppError } from "./recipes.js";
import { normalizeEmail } from "./auth-store.js";

export const planCodes = ["basico", "nutripro", "nutripro_plus"];

// Administrative DB access only. This is intentionally not an HTTP route.
export async function assignPlan(client, { email, plan, reason, apply = false }) {
  const account = normalizeEmail(email);
  if (!planCodes.includes(plan)) throw new AppError("INVALID_PLAN", "Usa basico, nutripro o nutripro_plus.");
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 300)
    throw new AppError("INVALID_REASON", "Indica un motivo de 1 a 300 caracteres.");
  await client.query("BEGIN");
  try {
    const current = (await client.query(
      "SELECT id,plan_code FROM profiles WHERE email=$1 FOR UPDATE", [account],
    )).rows[0];
    if (!current) throw new AppError("ACCOUNT_NOT_FOUND", "No existe una cuenta con ese correo.", 404);
    const changed = current.plan_code !== plan;
    if (apply && changed) {
      await client.query("SELECT set_config('nutribot.plan_change_reason',$1,true)", [reason.trim()]);
      await client.query("UPDATE profiles SET plan_code=$1,revision=revision+1,updated_at=now() WHERE id=$2", [plan,current.id]);
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { email: account, previous: current.plan_code, plan, changed, applied: apply && changed };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
