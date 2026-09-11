import os
from dotenv import load_dotenv
import psycopg2
from faker import Faker
from passlib.context import CryptContext

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
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


def main():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM usuarios")
            existentes = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM direcciones_envio")
            direcciones = cur.fetchone()[0]

        if existentes != direcciones:
            print(f"[ADVERTENCIA] Incoherencia: {existentes} usuarios vs {direcciones} direcciones.")

        if existentes >= TOTAL_USUARIOS:
            print(f"Ya existen {existentes} usuarios (máx {TOTAL_USUARIOS}). Nada que hacer.")
            return

        print(f"Hay {existentes} usuarios. Se crearán {TOTAL_USUARIOS - existentes} más "
              f"(índices {existentes + 1}..{TOTAL_USUARIOS}).")

        confirmados = existentes
        creados = 0
        with conn.cursor() as cur:
            try:
                for idx in range(existentes + 1, TOTAL_USUARIOS + 1):
                    nombre = fake.name()
                    email = (f"{fake.first_name().lower()}.{fake.last_name().lower()}"
                             f"{idx}@{fake.free_email_domain()}")
                    password_hash = pwd_context.hash(f"{PASSWORD_PREFIX}{idx:05d}")

                    cur.execute(
                        "INSERT INTO usuarios (nombre, email, password_hash) "
                        "VALUES (%s, %s, %s) RETURNING id",
                        (nombre, email, password_hash),
                    )
                    usuario_id = cur.fetchone()[0]

                    cur.execute(
                        "INSERT INTO direcciones_envio "
                        "(usuario_id, direccion, distrito, ciudad, pais) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (usuario_id, generar_direccion(),
                         fake.random_element(DISTRITOS), CIUDAD, PAIS),
                    )

                    creados += 1
                    if creados % BATCH_SIZE == 0:
                        conn.commit()
                        confirmados = existentes + creados
                        print(f"  ... {confirmados}/{TOTAL_USUARIOS} confirmados")

                conn.commit()
                confirmados = existentes + creados
            except KeyboardInterrupt:
                conn.rollback()
                print(f"\n[INTERRUMPIDO] Confirmados: {confirmados}. "
                      f"{creados - (confirmados - existentes)} del último lote se descartaron (rollback).")
                print("Vuelve a ejecutar el script para continuar donde quedó.")
                return

        print(f"Listo: {confirmados} usuarios con su dirección (coherencia garantizada).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()