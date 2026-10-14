// Called synchronously from the user's tap so the native camera keeps user activation.
export function prefersCamera(navigator = globalThis.navigator) {
  return Boolean(navigator?.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || "") ||
    (navigator?.platform === "MacIntel" && navigator?.maxTouchPoints > 1));
}

export async function preparePhoto(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Selecciona una foto JPG, PNG o WebP.");
  if (file.size > 15 * 1024 * 1024) throw new Error("La foto debe pesar como máximo 15 MB.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("No pude abrir esa foto. Prueba con otra imagen."); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.82);
    const data = preview.split(",")[1];
    if (!data || data.length > 4194304) throw new Error("La foto es demasiado grande. Usa una imagen más pequeña.");
    return { preview, image: { mimeType: "image/jpeg", data } };
  } finally { bitmap.close(); }
}

