import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { authenticatedFetch } from "./auth-api.js";

export default function PhoneConnection({ open, onClose }) {
  const dialog = useRef(null);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    const controller = new AbortController();
    setError("");
    setQr(null);
    authenticatedFetch("/api/connection", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("No pudimos cargar el QR. Vuelve a intentarlo.");
        return response.json();
      })
      .then((data) => {
        if (!data.qrCodes?.[0]) throw Error("No pudimos cargar el QR. Vuelve a intentarlo.");
        if (!controller.signal.aborted) setQr(data.qrCodes[0]);
      })
      .catch((problem) => {
        if (!controller.signal.aborted) setError(problem.message);
      });
    return () => controller.abort();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="phone-dialog"
      aria-labelledby="phone-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button className="phone-close" aria-label="Cerrar código QR" onClick={onClose}>
        <Icon name="close" />
      </button>
      <h2 id="phone-title">Instala Nutribot en tu teléfono</h2>
      {!qr && !error && <p role="status">Preparando el código QR…</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}
      {qr && (
        <a href={qr.url} aria-label="Abrir la instalación de Nutribot">
          <img className="phone-qr" src={qr.image} width="280" height="280"
            alt="Código QR para instalar Nutribot en tu teléfono" />
        </a>
      )}
    </dialog>
  );
}
