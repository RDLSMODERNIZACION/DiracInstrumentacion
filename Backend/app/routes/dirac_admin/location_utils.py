# app/routes/dirac_admin/location_utils.py
from fastapi import HTTPException
from psycopg.rows import dict_row

def ensure_location_id(
    conn,
    user_id: int,              # ignorado en modo abierto
    location_id: int | None,
    company_id: int | None,
    location_name: str | None,
) -> int | None:
    """
    MODO ABIERTO (sin permisos).
    - Si viene location_id: valida existencia.
    - Si NO viene: crea/usa la localización por (company_id, location_name) con UPSERT.
    - Si faltan datos, devuelve None.
    """
    with conn.cursor(row_factory=dict_row) as cur:
        if location_id is not None:
            cur.execute("SELECT id FROM locations WHERE id=%s", (location_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(400, f"location_id={location_id} no existe")
            return int(location_id)

        if not company_id or not (location_name or "").strip():
            return None

        name = location_name.strip()

        try:
            cur.execute(
                """
                INSERT INTO locations (name, company_id)
                VALUES (%s, %s)
                ON CONFLICT ON CONSTRAINT uniq_location_per_company_name
                DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """,
                (name, company_id),
            )
            return int(cur.fetchone()["id"])
        except Exception:
            # Fallback si el constraint aún no existe
            cur.execute(
                "SELECT id FROM locations WHERE company_id=%s AND name=%s",
                (company_id, name),
            )
            row = cur.fetchone()
            if row:
                return int(row["id"])
            cur.execute(
                "INSERT INTO locations (name, company_id) VALUES (%s, %s) RETURNING id",
                (name, company_id),
            )
            return int(cur.fetchone()["id"])
