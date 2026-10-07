import { useEffect, useState } from "react";
import Icon from "./Icons.jsx";
import { accountRequest } from "./auth-api.js";
import { todayDate } from "./date-utils.js";

export default function AuthPage({ brand, canClaimLegacy, onAuthenticated }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [remember, setRemember] = useState(false);
  const [claimLegacy, setClaimLegacy] = useState(Boolean(canClaimLegacy));
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function changeStep(next) {
    setStep(next);
    setError("");
    setPassword("");
    setConfirm("");
    setVisible(false);
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (step === "register" && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      if (step === "email") {
        const result = await accountRequest("lookup", { email });
        if (!["login", "register"].includes(result.nextStep))
          throw Error("No se pudo comprobar el correo. Inténtalo de nuevo.");
        setEmail(email.trim().toLowerCase());
        changeStep(result.nextStep);
        return;
      }
      const session = await accountRequest(step, {
        email,
        password,
        remember,
        ...(step === "register" ? { name, birthDate, claimLegacy } : {}),
      });
      setPassword("");
      setConfirm("");
      onAuthenticated(session);
    } catch (problem) {
      setError(
        problem.message ||
          "No pudimos conectar. Comprueba que Nutribot siga abierto en la PC.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header className="auth-brand">
        <a href="#welcome" aria-label="Volver al inicio de NutriBot">
          {brand}
        </a>
      </header>
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-heading">
            <div className="auth-logo">
              <img src="/nutribot-logo.png" alt="Logo de Nutribot" />
            </div>
            <h1 id="auth-title">
              {step === "register"
                ? "Crea tu cuenta en NutriBot"
                : "Bienvenido a NutriBot"}
            </h1>
            <p>
              Tu asistente de cocina inteligente.
              <br />
              Una cocina con más posibilidades.
            </p>
          </div>
          {step !== "email" && (
            <div className="auth-email-summary">
              <span className="auth-email-avatar">
                <Icon name="user" />
              </span>
              <div>
                <small>
                  {step === "register" ? "Tu nueva cocina" : "Tu cuenta"}
                </small>
                <strong>{email}</strong>
              </div>
              <button
                type="button"
                onClick={() => changeStep("email")}
                disabled={busy}
              >
                Cambiar
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {step === "email" ? (
                <label htmlFor="auth-email">
                  Correo electrónico
                  <div className="auth-input">
                    <Icon name="mail" />
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="tu@correo.com"
                    />
                  </div>
                </label>
              ) : (
                <>
                  {step === "register" && (
                    <>
                      <label htmlFor="auth-name">
                        Tu nombre
                        <div className="auth-input">
                          <Icon name="user" />
                          <input
                            id="auth-name"
                            autoComplete="given-name"
                            required
                            maxLength={35}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="¿Cómo te llamas?"
                          />
                        </div>
                      </label>
                      <label htmlFor="auth-birth">
                        Fecha de nacimiento <small>opcional</small>
                        <div className="auth-input">
                          <Icon name="calendar" />
                          <input
                            id="auth-birth"
                            type="date"
                            max={todayDate()}
                            min="1900-01-01"
                            autoComplete="bday"
                            value={birthDate}
                            onChange={(event) =>
                              setBirthDate(event.target.value)
                            }
                          />
                        </div>
                      </label>
                    </>
                  )}
                  <label htmlFor="auth-password">
                    Contraseña
                    <div className="auth-input">
                      <Icon name="lock" />
                      <input
                        id="auth-password"
                        type={visible ? "text" : "password"}
                        autoComplete={
                          step === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        required
                        minLength={step === "register" ? 15 : undefined}
                        maxLength={128}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={
                          step === "register"
                            ? "Al menos 15 caracteres"
                            : "Ingresa tu contraseña"
                        }
                      />
                      <button
                        type="button"
                        aria-label={
                          visible ? "Ocultar contraseña" : "Mostrar contraseña"
                        }
                        aria-pressed={visible}
                        onClick={() => setVisible((value) => !value)}
                      >
                        <Icon name="eye" />
                      </button>
                    </div>
                  </label>
                  {step === "register" && (
                    <>
                      <p className="auth-hint">
                        Usa una frase larga que puedas recordar, de 15 a 128
                        caracteres.
                      </p>
                      <label htmlFor="auth-confirm">
                        Confirmar contraseña
                        <div className="auth-input">
                          <Icon name="lock" />
                          <input
                            id="auth-confirm"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={15}
                            maxLength={128}
                            value={confirm}
                            onChange={(event) => setConfirm(event.target.value)}
                            placeholder="Escribe la contraseña otra vez"
                          />
                        </div>
                      </label>
                      {canClaimLegacy && (
                        <label className="auth-checkbox legacy-claim">
                          <input
                            type="checkbox"
                            checked={claimLegacy}
                            onChange={(event) =>
                              setClaimLegacy(event.target.checked)
                            }
                          />
                          <span>
                            Vincular a esta cuenta el perfil, la despensa y las
                            recetas que ya están en esta PC.
                          </span>
                        </label>
                      )}
                    </>
                  )}
                  <label className="auth-checkbox">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                    />
                    <span>Recordar mi sesión en este dispositivo</span>
                  </label>
                </>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  <Icon name="info" size={18} />
                  {error}
                </p>
              )}
              <button className="auth-submit" type="submit">
                {busy
                  ? "Un momento…"
                  : step === "email"
                    ? "Continuar con correo"
                    : step === "register"
                      ? "Crear mi cuenta"
                      : "Iniciar sesión"}
                <Icon name="arrow" size={20} />
              </button>
            </fieldset>
          </form>
          <p className="auth-switch">
            <a href="#welcome">Volver al inicio</a>
          </p>
          {canClaimLegacy && step !== "register" && (
            <p className="auth-existing">
              <Icon name="shield" size={16} />
              Al crear tu primera cuenta puedes conservar los datos que ya
              tienes en esta PC.
            </p>
          )}
          <p className="auth-storage">
            Cada cuenta tiene su propia despensa. Tus datos se guardan en la PC
            que ejecuta Nutribot.
          </p>
        </section>
        <div className="auth-footer-note">
          <Icon name="leaf" size={19} />
          <span>Menos dudas. Más ideas con lo que tienes.</span>
        </div>
      </main>
      <footer className="auth-footer">© 2026 NutriBot</footer>
    </div>
  );
}
