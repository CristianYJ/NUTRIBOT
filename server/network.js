import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";
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
export function localTls() {
  const cert = process.env.NUTRIBOT_TLS_CERT,
    key = process.env.NUTRIBOT_TLS_KEY;
  if (!cert && !key) return null;
  if (!cert || !key)
    throw new Error(
      "Configura ambos archivos NUTRIBOT_TLS_CERT y NUTRIBOT_TLS_KEY.",
    );
  return { cert: readFileSync(cert), key: readFileSync(key) };
}
export async function connectionInfo(port, secure = false) {
  const hosts = localAddresses();
  const urls = hosts.map(
    (host) => `${secure ? "https" : "http"}://${host}:${port}`,
  );
  return {
    hosts,
    origins: urls,
    urls,
    secure,
    qrCodes: await Promise.all(
      urls.map(async (url) => ({
        url,
        image: await QRCode.toDataURL(url, {
          width: 280,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      })),
    ),
  };
}
export async function printConnection(info, port) {
  console.log(
    `\nNutribot en esta PC: ${info.secure ? "https" : "http"}://localhost:${port}`,
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
    "El QR también está en el menú de perfil → Conectar teléfono. Mantén esta PC y Nutribot encendidos.\n",
  );
}
