import nodemailer from 'nodemailer';

export function createPasswordMailer(env = process.env) {
  const password = env.NUTRIBOT_SMTP_PASSWORD;
  if (!password) return null;
  const sender = 'soporte@nutribot.online';
  const host = env.NUTRIBOT_SMTP_HOST || 'smtp.hostinger.com';
  const port = Number(env.NUTRIBOT_SMTP_PORT || 465);
  if (!Number.isInteger(port) || ![465, 587].includes(port))
    throw new Error('NUTRIBOT_SMTP_PORT debe ser 465 o 587.');
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: port === 587,
    auth: { user: sender, pass: password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return async ({ to, link }) => {
    await transport.sendMail({
      from: `NutriBot <${sender}>`, to,
      subject: 'Cambia tu contraseña de NutriBot',
      text: `Recibimos una solicitud para cambiar tu contraseña de NutriBot.\n\nAbre este enlace para elegir una contraseña nueva:\n${link}\n\nEl enlace vence en 20 minutos y solo se puede usar una vez. No iniciará sesión automáticamente. Si no solicitaste el cambio, ignora este correo.\n`,
    });
  };
}
