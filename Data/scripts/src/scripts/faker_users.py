import csv
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from faker import Faker
from passlib.context import CryptContext

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[3]  # Data/
CSV_DIR = BASE_DIR / "csv"
USUARIOS_CSV = CSV_DIR / "usuarios.csv"
DIRECCIONES_CSV = CSV_DIR / "direcciones_envio.csv"

USUARIOS_COLS = ["id", "nombre", "email", "password_hash", "creado_en"]
DIRECCIONES_COLS = ["id", "usuario_id", "direccion", "distrito", "ciudad", "pais", "es_principal"]

TOTAL_USUARIOS = int(os.getenv("TOTAL_USUARIOS", "20000"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "500"))
PASSWORD_PREFIX = os.getenv("PASSWORD_PREFIX", "usuario")
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "4"))
PAIS = os.getenv("PAIS", "Perú")
CIUDAD = os.getenv("CIUDAD", "Lima")

fake = Faker("es_ES")
Faker.seed(0)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=BCRYPT_ROUNDS)

DISTRITOS = [
    "Miraflores", "San Isidro", "Surco", "La Molina", "San Borja",
    "Barranco", "Chorrillos", "Lince", "Magdalena", "Pueblo Libre",
    "Jesús María", "San Miguel", "Callao", "Los Olivos", "Comas",
    "San Martín de Porres", "Independencia", "Rímac", "Cercado de Lima",
    "Ate", "Santa Anita", "Villa El Salvador", "Villa María del Triunfo",
]


def generar_direccion():
    prefijo = fake.random_element(["Jr.", "Av.", "Calle", "Psje.", "Pasaje", "Ca."])
    return f"{prefijo} {fake.street_name()} {fake.building_number()}"


def _ahora():
    now = datetime.now().astimezone()
    return now.strftime("%Y-%m-%d %H:%M:%S.%f") + now.strftime("%z")[:3]


def _leer_csv(path, columnas):
    if not path.exists():
        return None
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != columnas:
            return None
        return list(reader)


def _escribir_header(path, columnas):
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fieldnames=columnas).writeheader()


def main():
    CSV_DIR.mkdir(parents=True, exist_ok=True)

    usuarios = _leer_csv(USUARIOS_CSV, USUARIOS_COLS)
    direcciones = _leer_csv(DIRECCIONES_CSV, DIRECCIONES_COLS)

    if usuarios is None:
        usuarios = []
        _escribir_header(USUARIOS_CSV, USUARIOS_COLS)
    if direcciones is None:
        direcciones = []
        _escribir_header(DIRECCIONES_CSV, DIRECCIONES_COLS)

    existentes = len(usuarios)
    next_user_id = max((int(u["id"]) for u in usuarios), default=0) + 1
    next_dir_id = max((int(d["id"]) for d in direcciones), default=0) + 1
    con_direccion = {int(d["usuario_id"]) for d in direcciones}

    sin_direccion = [int(u["id"]) for u in usuarios if int(u["id"]) not in con_direccion]
    if sin_direccion:
        print(f"[ADVERTENCIA] {len(sin_direccion)} usuarios sin dirección. Se crearán.")

    if existentes >= TOTAL_USUARIOS and not sin_direccion:
        print(f"Ya existen {existentes} usuarios con su dirección (máx {TOTAL_USUARIOS}). Nada que hacer.")
        return

    if existentes >= TOTAL_USUARIOS:
        print(f"Ya hay {existentes} usuarios. Solo faltan {len(sin_direccion)} direcciones.")
    else:
        print(f"Hay {existentes} usuarios. Se crearán {TOTAL_USUARIOS - existentes} más "
              f"(índices {next_user_id}..{TOTAL_USUARIOS}).")

    creados = 0
    with USUARIOS_CSV.open("a", newline="", encoding="utf-8") as fu, \
            DIRECCIONES_CSV.open("a", newline="", encoding="utf-8") as fd:
        wu = csv.DictWriter(fu, fieldnames=USUARIOS_COLS)
        wd = csv.DictWriter(fd, fieldnames=DIRECCIONES_COLS)

        creado_en = _ahora()

        for usuario_id in sin_direccion:
            wd.writerow({
                "id": next_dir_id,
                "usuario_id": usuario_id,
                "direccion": generar_direccion(),
                "distrito": fake.random_element(DISTRITOS),
                "ciudad": CIUDAD,
                "pais": PAIS,
                "es_principal": "true",
            })
            next_dir_id += 1

        try:
            for idx in range(next_user_id, TOTAL_USUARIOS + 1):
                nombre = fake.name()
                email = (f"{fake.first_name().lower()}.{fake.last_name().lower()}"
                         f"{idx}@{fake.free_email_domain()}")
                password_hash = pwd_context.hash(f"{PASSWORD_PREFIX}{idx:05d}")

                wu.writerow({
                    "id": idx,
                    "nombre": nombre,
                    "email": email,
                    "password_hash": password_hash,
                    "creado_en": creado_en,
                })
                wd.writerow({
                    "id": next_dir_id,
                    "usuario_id": idx,
                    "direccion": generar_direccion(),
                    "distrito": fake.random_element(DISTRITOS),
                    "ciudad": CIUDAD,
                    "pais": PAIS,
                    "es_principal": "true",
                })
                next_dir_id += 1

                creados += 1
                if creados % BATCH_SIZE == 0:
                    fu.flush()
                    fd.flush()
                    print(f"  ... {existentes + creados}/{TOTAL_USUARIOS} usuarios")
        except KeyboardInterrupt:
            fu.flush()
            fd.flush()
            print(f"\n[INTERRUMPIDO] Se escribieron {creados} usuarios nuevos. "
                  "Vuelve a ejecutar el script para continuar donde quedó.")
            return

    print(f"Listo: {TOTAL_USUARIOS} usuarios con su dirección (coherencia garantizada).")


if __name__ == "__main__":
    main()
