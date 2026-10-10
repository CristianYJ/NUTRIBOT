#!/usr/bin/env python3
"""Initial configuration on Oracle only. Never copy the local .env to the release."""
import getpass
import os
from pathlib import Path
import secrets
import sys
import tempfile


def environment_value(value):
    if not value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("El valor no puede estar vacío ni contener caracteres de control.")
    # systemd EnvironmentFile supports double-quoted strings, without shell expansion.
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def write_environment(target, values):
    body = "".join(f"{key}={environment_value(value)}\n" for key, value in values.items())
    fd, name = tempfile.mkstemp(prefix=".nutribot-", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(body)
        os.replace(name, target)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    if os.name != "posix" or os.geteuid() != 0:
        raise SystemExit("Ejecutar con sudo python3 en Oracle Linux.")
    if not sys.stdin.isatty():
        raise SystemExit("Ejecutar desde una terminal interactiva para ocultar las credenciales.")
    directory = Path("/etc/nutribot")
    if directory.is_symlink():
        raise SystemExit("/etc/nutribot no puede ser un enlace simbólico.")
    directory.mkdir(mode=0o700, exist_ok=True)
    os.chown(directory, 0, 0)
    os.chmod(directory, 0o700)
    targets = [directory / "nutribot.env", directory / "caddy.env"]
    if any(target.exists() or target.is_symlink() for target in targets):
        raise SystemExit("Ya hay configuración privada. No se ha sobrescrito ningún archivo.")
    password = getpass.getpass("Contraseña de PostgreSQL de nutribot_app en Oracle: ")
    api_key = getpass.getpass("Clave de Gemini (entrada oculta): ")
    environment_value(password)
    environment_value(api_key)
    proxy_secret = secrets.token_hex(32)
    write_environment(targets[0], {
        "NODE_ENV": "production",
        "PUBLIC_ORIGIN": "https://nutribot.facheritossv.com",
        "NUTRIBOT_PROXY_SECRET": proxy_secret,
        "PGHOST": "127.0.0.1", "PGPORT": "5432",
        "PGUSER": "nutribot_app", "PGPASSWORD": password,
        "PGDATABASE": "nutribot_project",
        "GEMINI_API_KEY": api_key,
        "GEMINI_MODEL": "gemini-3.5-flash-lite",
    })
    write_environment(targets[1], {"NUTRIBOT_PROXY_SECRET": proxy_secret})
    print("Configuración guardada en /etc/nutribot con permisos 600. No se iniciaron servicios.")


if __name__ == "__main__":
    main()
