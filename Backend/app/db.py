# app/db.py
import os
import logging
from psycopg_pool import ConnectionPool

log = logging.getLogger(__name__)

DSN = os.environ.get("DATABASE_URL")
if not DSN:
    raise RuntimeError("Falta la env DATABASE_URL")

PG_POOL_MIN_SIZE = int(os.getenv("PG_POOL_MIN_SIZE", "1"))
PG_POOL_MAX_SIZE = int(os.getenv("PG_POOL_MAX_SIZE", "10"))
PG_POOL_TIMEOUT = float(os.getenv("PG_POOL_TIMEOUT", "5"))
PG_POOL_MAX_WAITING = int(os.getenv("PG_POOL_MAX_WAITING", "50"))

DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "5"))

pool = ConnectionPool(
    conninfo=DSN,
    min_size=PG_POOL_MIN_SIZE,
    max_size=PG_POOL_MAX_SIZE,
    timeout=PG_POOL_TIMEOUT,
    max_waiting=PG_POOL_MAX_WAITING,
    kwargs={
        "sslmode": "require",
        "connect_timeout": DB_CONNECT_TIMEOUT,
        "prepare_threshold": None,
        # ✅ corta queries colgadas (evita secuestro de conexiones)
        "options": "-c statement_timeout=5000",
    },
)

def get_conn(timeout: float | None = None):
    return pool.connection(timeout=timeout or PG_POOL_TIMEOUT)

def close_pool():
    try:
        pool.close()
    except Exception:
        log.exception("Error cerrando pool")
