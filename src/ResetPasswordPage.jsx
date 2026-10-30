import { useEffect, useState } from 'react';
import { accountRequest } from './auth-api.js';

export default function ResetPasswordPage() {
  const [token] = useState(() => /^#restablecer\/([a-f0-9]{64})$/.exec(location.hash)?.[1] || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { history.replaceState(null, '', '#restablecer'); }, []);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      await accountRequest('password-reset/complete', { token, newPassword: password });
      window.dispatchEvent(new Event('nutribot:unauthorized'));
      setDone(true);
      setPassword(''); setConfirm('');
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  return <div className="auth-page"><main className="auth-main"><section className="auth-card" aria-labelledby="reset-title">
    <h1 id="reset-title">Cambiar contraseña</h1>
    {done ? <><p role="status">Tu contraseña cambió. Ahora inicia sesión con la nueva contraseña.</p><a className="auth-submit" href="#auth">Ir a iniciar sesión</a></>
      : !token ? <><p role="alert">El enlace no es válido o ya venció.</p><a href="#auth">Volver al acceso</a></>
      : <form onSubmit={submit}><fieldset disabled={busy}>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Confirmar contraseña<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit">{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </fieldset></form>}
  </section></main></div>;
}
