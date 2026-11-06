import nodemailer from 'nodemailer';

const sender = 'soporte@nutribot.online';
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function passwordResetMessage({ name, link }) {
  const greeting = name?.trim() ? `Hola, ${name.trim()}:` : 'Hola:';
  const safeGreeting = escapeHtml(greeting);
  const safeLink = escapeHtml(link);
  const logoUrl = escapeHtml(new URL('/nutribot-logo.png', link).href);
  return {
    subject: 'Restablece tu contraseña de NutriBot',
    text: `${greeting}\n\nRecibimos una solicitud para restablecer la contraseña de tu cuenta. Para crear una nueva, abre este enlace:\n\n${link}\n\nEl enlace vence en 20 minutos y solo se puede usar una vez. Si no esperabas este correo, puedes ignorarlo. Si necesitas ayuda, escríbenos a ${sender}.\n\nSaludos,\nEl equipo de NutriBot`,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f6f7fb;color:#11213a;font-family:Arial,Helvetica,sans-serif;line-height:1.55">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e9e4;border-radius:20px"><tr><td style="padding:32px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;padding-right:12px"><img src="${logoUrl}" width="42" height="42" alt="Logo de NutriBot" style="display:block;width:42px;height:42px;object-fit:contain"></td><td style="vertical-align:middle;color:#007456;font-size:23px;font-weight:700">NutriBot</td></tr></table>
        <h1 style="font-size:24px;line-height:1.25;margin:30px 0 18px;color:#11213a">Restablece tu contraseña</h1>
        <p style="margin:0 0 16px">${safeGreeting}</p>
        <p style="margin:0 0 24px">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Para crear una nueva, selecciona el siguiente botón:</p>
        <p style="margin:0 0 26px"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#007456;color:#fff;text-decoration:none;font-weight:700">Restablecer contraseña</a></p>
        <p style="margin:0 0 8px">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
        <p style="margin:0 0 24px;overflow-wrap:anywhere;word-break:break-word"><a href="${safeLink}" style="color:#006b51">${safeLink}</a></p>
        <p style="margin:0 0 16px;color:#53675b;font-size:14px">El enlace vence en 20 minutos y solo se puede usar una vez.</p>
        <p style="margin:0 0 24px">Si no esperabas este correo, puedes ignorarlo. Si necesitas ayuda, escríbenos a <a href="mailto:${sender}" style="color:#006b51">${sender}</a>.</p>
        <p style="margin:0">Saludos,<br><strong>El equipo de NutriBot</strong></p>
      </td></tr></table>
    </body></html>`,
  };
}

export function createMailTransport(env = process.env) {
  const password = env.NUTRIBOT_SMTP_PASSWORD;
  if (!password) return null;
  const host = env.NUTRIBOT_SMTP_HOST || 'smtp.hostinger.com';
  const port = Number(env.NUTRIBOT_SMTP_PORT || 465);
  if (!Number.isInteger(port) || ![465, 587].includes(port))
    throw new Error('NUTRIBOT_SMTP_PORT debe ser 465 o 587.');
  return nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: port === 587,
    auth: { user: sender, pass: password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
}

export function createPasswordMailer(env = process.env) {
  const transport = createMailTransport(env);
  if (!transport) return null;
  return async ({ to, name, link }) => {
    await transport.sendMail({ from: `NutriBot <${sender}>`, to, ...passwordResetMessage({ name, link }) });
  };
}
