import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { authenticatedFetch } from "./auth-api.js";
export default function PhoneConnection({ open, onClose }) {
  const dialog = useRef(null);
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    const controller = new AbortController();
    setError("");
    setData(null);
    setSelected(0);
    authenticatedFetch("/api/connection", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw Error("No pudimos cargar la conexión. Vuelve a intentarlo.");
        return response.json();
      })
      .then(setData)
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
      <button
        className="phone-close"
        aria-label="Cerrar código QR"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <span className="phone-mark">
        <Icon name="qr" size={26} />
      </span>
      <h2 id="phone-title">Tu cocina, también en el teléfono</h2>
      <p>
        Conecta el teléfono y esta PC a la misma red Wi-Fi. Escanea el código e
        inicia sesión con tu cuenta.
      </p>
      {!data && !error && <p role="status">Preparando el código QR…</p>}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {data?.qrCodes?.length > 0 ? (
        <>
          <img
            className="phone-qr"
            src={data.qrCodes[selected].image}
            alt="Código QR para abrir Nutribot en el teléfono"
          />
          <a className="phone-url" href={data.qrCodes[selected].url}>
            {data.qrCodes[selected].url}
          </a>
          {data.qrCodes.length > 1 && (
            <label>
              Dirección de red
              <select
                value={selected}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {data.qrCodes.map((item, index) => (
                  <option value={index} key={item.url}>
                    {item.url}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="phone-network-note">
            Conexión HTTP en la red local. El QR abre la aplicación; inicia sesión con tu cuenta.
          </p>
        </>
      ) : (
        data && (
          <p className="auth-existing">
            No encontramos una dirección de red privada. Conecta la PC a Wi-Fi o
            Ethernet y reinicia Nutribot.
          </p>
        )
      )}
      <div className="phone-save-note">
        <Icon name="shield" size={19} />
        <span>
          Los cambios se guardan en tu cuenta, en la base de datos de esta PC.
          Mantén la PC y Nutribot encendidos.
        </span>
      </div>
    </dialog>
  );
}
