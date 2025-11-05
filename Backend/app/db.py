import os
from psycopg_pool import ConnectionPool

# Usar SIEMPRE el pooler de Supabase (puerto 6543) con SSL, ej:
# postgresql://USER:PASS@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require
DSN = os.environ.get("DATABASE_URL")
if not DSN:
    raise RuntimeError(
        "Falta la env DATABASE_URL (ej: postgresql://user:pass@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require)"
    )

# Pool simple y estable
pool = ConnectionPool(
    conninfo=DSN,
    min_size=1,
    max_size=8,
    timeout=30,  # segundos para conseguir una conexión del pool
    kwargs={
        "sslmode": "require",
        "connect_timeout": 5,  # segundos para abrir el socket a la DB
    },
)

def get_conn():
    """Uso: with get_conn() as conn: ..."""
    return pool.connection()

def close_pool():
    try:
        pool.close()
    except Exception:
        pass
