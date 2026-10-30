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
      if (step === 'forgot') {
        await accountRequest('password-reset/request', { email });
        changeStep('sent');
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
          "No pudimos conectar.",
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
          </div>
          {step !== "email" && step !== 'sent' && (
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
          {step === 'sent' ? <div role="status" className="auth-reset-message">
            <p>Si el correo está registrado, recibirás un enlace para elegir una contraseña nueva. Revisa también la carpeta de spam.</p>
            <button type="button" className="auth-submit" onClick={() => changeStep('login')}>Volver a iniciar sesión</button>
          </div> : <form onSubmit={submit}>
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
              ) : step === 'forgot' ? <p>Si {email} está asociado a una cuenta, enviaremos un enlace para restablecer la contraseña.</p> : (
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
                        minLength={step === "register" ? 8 : undefined}
                        maxLength={128}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={
                          step === "register"
                            ? "Al menos 8 caracteres"
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
                  {step === 'login' && <button type="button" className="auth-forgot-link" onClick={() => changeStep('forgot')}>Olvidé mi contraseña</button>}
                  {step === "register" && (
                    <>
                      <p className="auth-hint">
                        Usa una contraseña de entre 8 y 128 caracteres.
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
                            minLength={8}
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
                      : step === 'forgot'
                        ? 'Enviar'
                      : "Iniciar sesión"}
                <Icon name="arrow" size={20} />
              </button>
            </fieldset>
          </form>}
          <p className="auth-switch">
            <a className="auth-back-home" href="#welcome">
              <span className="auth-back-icon"><Icon name="home" size={18} /></span>
              <span>Volver al inicio</span>
              <span className="auth-back-arrow" aria-hidden="true">←</span>
            </a>
          </p>
        </section>
      </main>
      <footer className="auth-footer">© 2026 NutriBot · <a href="#politica-privacidad">Política de privacidad</a></footer>
    </div>
  );
}
