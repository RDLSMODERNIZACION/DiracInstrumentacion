# app/db.py
import os
import logging
from psycopg_pool import ConnectionPool

log = logging.getLogger(__name__)

DSN = os.environ.get("DATABASE_URL")
if not DSN:
    raise RuntimeError("Falta la env DATABASE_URL")

# ✅ Ajustables por ENV (Render)
PG_POOL_MIN_SIZE = int(os.getenv("PG_POOL_MIN_SIZE", "1"))
PG_POOL_MAX_SIZE = int(os.getenv("PG_POOL_MAX_SIZE", "10"))
PG_POOL_TIMEOUT = float(os.getenv("PG_POOL_TIMEOUT", "5"))          # antes 30s -> MUY alto
PG_POOL_MAX_WAITING = int(os.getenv("PG_POOL_MAX_WAITING", "50"))   # cola máxima de espera

# connect_timeout (socket) separado del timeout de pool
DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "5"))

pool = ConnectionPool(
    conninfo=DSN,
    min_size=PG_POOL_MIN_SIZE,
    max_size=PG_POOL_MAX_SIZE,
    timeout=PG_POOL_TIMEOUT,         # tiempo máximo esperando una conexión libre del pool
    max_waiting=PG_POOL_MAX_WAITING, # evita backlog infinito
    kwargs={
        # Si el DSN ya trae sslmode=require, no molesta repetirlo.
        "sslmode": "require",
        "connect_timeout": DB_CONNECT_TIMEOUT,
        # ✅ importante con poolers tipo PgBouncer
        "prepare_threshold": None,
    },
)

def get_conn(timeout: float | None = None):
    """
    Uso: with get_conn() as conn: ...
    Si querés, podés pasar timeout puntual (en segundos) para esa operación.
    """
    return pool.connection(timeout=timeout or PG_POOL_TIMEOUT)

def close_pool():
    try:
        pool.close()
    except Exception:
        log.exception("Error cerrando pool")
