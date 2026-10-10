import { networkInterfaces } from "node:os";
import QRCode from "qrcode";
export function publicDeployment(env = process.env, development = false) {
  const origin = env.PUBLIC_ORIGIN?.trim();
  const proxySecret = env.NUTRIBOT_PROXY_SECRET;
  if (!origin && !proxySecret) return null;
  let url;
  try {
    url = new URL(origin);
  } catch {
    // A partially configured public deployment must not fall back to LAN mode.
  }
  if (
    development || !url || url.protocol !== "https:" ||
    url.username || url.password || url.pathname !== "/" ||
    url.search || url.hash || url.port ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(url.hostname) ||
    !/^[a-f0-9]{64}$/.test(proxySecret || "")
  ) {
    const error = new Error("Configura PUBLIC_ORIGIN con el dominio HTTPS y NUTRIBOT_PROXY_SECRET con 64 caracteres hexadecimales. El modo público requiere npm start.");
    error.code = "INVALID_PUBLIC_CONFIG";
    throw error;
  }
  return { origin: url.origin, hostname: url.hostname, proxySecret };
}
export function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  );
}
export function localAddresses(interfaces = networkInterfaces()) {
  return [
    ...new Set(
      Object.entries(interfaces)
        .sort(
          ([a], [b]) =>
            Number(/virtual|docker|vethernet|wsl/i.test(a)) -
            Number(/virtual|docker|vethernet|wsl/i.test(b)),
        )
        .flatMap(([, entries]) => entries || [])
        .filter(
          (item) =>
            (item.family === "IPv4" || item.family === 4) &&
            !item.internal &&
            isPrivateIpv4(item.address),
        )
        .map((item) => item.address),
    ),
  ];
}
export async function connectionInfo(port, deployment = null) {
  const hosts = deployment ? [deployment.hostname] : localAddresses();
  const urls = deployment ? [deployment.origin] : hosts.map(
    (host) => `http://${host}:${port}`,
  );
  const installUrl = `${deployment?.origin || "https://nutribot.facheritossv.com"}/?install=1`;
  return {
    hosts,
    origins: urls,
    urls,
    secure: Boolean(deployment),
    public: Boolean(deployment),
    proxySecret: deployment?.proxySecret,
    qrCodes: [{
      url: installUrl,
      image: await QRCode.toDataURL(installUrl, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
    }],
  };
}
export async function printConnection(info, port) {
  if (info.public) {
    console.log(`\nNutribot: ${info.urls[0]}\n`);
    return;
  }
  console.log(
    `\nNutribot en esta PC: http://localhost:${port}`,
  );
  if (!info.urls.length) {
    console.log(
      "Conecta la PC a una red Wi-Fi o Ethernet privada para generar el QR del teléfono.",
    );
    return;
  }
  console.log(
    `\nTeléfono: conecta ambos dispositivos a la misma red y escanea el QR.\n${info.urls[0]}\n`,
  );
  console.log(
    await QRCode.toString(info.urls[0], { type: "terminal", small: true }),
  );
  if (info.urls.length > 1)
    console.log("Otras direcciones de esta PC:", info.urls.slice(1).join(", "));
  console.log(
    "Este QR abre la versión local. Para instalar la versión publicada, usa el menú de perfil → Instalar en mi teléfono.\n",
  );
}
