import { createMailTransport } from './password-mail.js';

const sender = 'soporte@nutribot.online';
const plans = Object.freeze({
  nutripro: { name: 'NutriPro', recipes: 14, photos: 3 },
  nutripro_plus: { name: 'NutriMax', recipes: 22, photos: 6 },
});
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function planWelcomeMessage({ name, plan, origin }) {
  const choice = plans[plan];
  if (!choice) throw new Error('Plan inválido para correo de bienvenida.');
  const profileUrl = new URL('/#profile', origin).href;
  const logoUrl = new URL('/nutribot-logo.png', origin).href;
  const greeting = name?.trim() ? `Hola, ${name.trim()}:` : 'Hola:';
  return {
    subject: `¡Bienvenido a ${choice.name} de NutriBot!`,
    text: `${greeting}\n\nTu plan ${choice.name} ya está activo. Ahora tienes ${choice.recipes} generaciones de recetas por semana y ${choice.photos} fotos con Nutri-Vision por mes.\n\nConsulta tu plan y tus transacciones en tu perfil:\n${profileUrl}\n\nEsta afiliación se realizó en el entorno de pruebas de Wompi; no se efectuó un cobro real. Si necesitas ayuda, escríbenos a ${sender}.\n\n¡A cocinar!\nEl equipo de NutriBot`,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f6f7fb;color:#11213a;font-family:Arial,Helvetica,sans-serif;line-height:1.55">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e9e4;border-radius:20px"><tr><td style="padding:32px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;padding-right:12px"><img src="${escapeHtml(logoUrl)}" width="42" height="42" alt="Logo de NutriBot" style="display:block;width:42px;height:42px;object-fit:contain"></td><td style="vertical-align:middle;color:#007456;font-size:23px;font-weight:700">NutriBot</td></tr></table>
        <h1 style="font-size:24px;line-height:1.25;margin:30px 0 18px;color:#11213a">¡Bienvenido a ${choice.name}!</h1>
        <p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 16px">Tu plan ya está activo. Disfruta de <strong>${choice.recipes} generaciones de recetas por semana</strong> y <strong>${choice.photos} fotos con Nutri-Vision por mes</strong>.</p>
        <p style="margin:0 0 24px">Puedes consultar tu plan y tus transacciones en tu perfil.</p>
        <p style="margin:0 0 26px"><a href="${escapeHtml(profileUrl)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#007456;color:#fff;text-decoration:none;font-weight:700">Ver mi perfil</a></p>
        <p style="margin:0 0 18px;color:#53675b;font-size:14px">Esta afiliación se realizó en el entorno de pruebas de Wompi; no se efectuó un cobro real.</p>
        <p style="margin:0 0 24px">Si necesitas ayuda, escríbenos a <a href="mailto:${sender}" style="color:#006b51">${sender}</a>.</p>
        <p style="margin:0">¡A cocinar!<br><strong>El equipo de NutriBot</strong></p>
      </td></tr></table>
    </body></html>`,
  };
}

export function createPlanWelcomeMailer({ origin, env = process.env }) {
  const transport = createMailTransport(env);
  if (!transport) return null;
  return async ({ to, name, plan }) => {
    await transport.sendMail({ from: `NutriBot <${sender}>`, to, ...planWelcomeMessage({ name, plan, origin }) });
  };
}
