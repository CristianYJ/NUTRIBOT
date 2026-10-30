import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import PlanBadge from "./PlanBadge.jsx";
export default function AccountMenu({
  profile,
  onProfile,
  onLogout,
  onConnect,
  loggingOut,
}) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    const closeOutside = (event) => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  function choose(action) {
    setOpen(false);
    action();
  }
  return (
    <div
      className="account-menu"
      ref={container}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="culinary-user"
        aria-label="Abrir menú de perfil"
        aria-expanded={open}
        aria-controls="account-options"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="avatar">{profile.name.charAt(0) || "T"}</span>
        <span>
          <strong>{profile.name}</strong>
          <PlanBadge plan={profile.plan} />
        </span>
      </button>
      {open && (
        <div id="account-options" className="account-options">
          <div className="account-identity">
            <strong>{profile.name}</strong>
            <small>{profile.email}</small>
            <PlanBadge plan={profile.plan} />
          </div>
          <button onClick={() => choose(onProfile)}>
            <Icon name="user" size={18} />
            Mi perfil
          </button>
          <button onClick={() => choose(onConnect)}>
            <Icon name="qr" size={18} />
            Instalar en mi teléfono
          </button>
          <button
            className="logout-option"
            disabled={loggingOut}
            onClick={() => choose(onLogout)}
          >
            <Icon name="logout" size={18} />
            {loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}
