# app/routes/dirac_admin/location_utils.py
from fastapi import HTTPException
from psycopg.rows import dict_row

def assert_user_is_company_admin(cur, user_id: int, company_id: int):
    cur.execute(
        "SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND company_id=%s AND role IN ('owner','admin')) AS ok",
        (user_id, company_id)
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(403, "Se requiere owner/admin en la empresa")

def ensure_location_id(conn, user_id: int, location_id: int | None, company_id: int | None, location_name: str | None) -> int | None:
    """
    Devuelve un location_id válido. Si viene location_id => valida que exista y que el user sea admin en su empresa.
    Si no viene, crea/actualiza (UPSERT) la localización por (company_id, location_name).
    """
    with conn.cursor(row_factory=dict_row) as cur:
        if location_id is not None:
            # Validar existencia y permisos
            cur.execute("SELECT id, company_id FROM locations WHERE id=%s", (location_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(400, f"location_id={location_id} no existe")
            if row["company_id"] is not None:
                assert_user_is_company_admin(cur, user_id, row["company_id"])
            return location_id

        # Si no hay location_id, exigir company_id + location_name
        if not company_id or not (location_name or "").strip():
            return None  # caller decide si permitir NULL o no

        assert_user_is_company_admin(cur, user_id, company_id)

        # UPSERT por (company_id, name) — requiere el índice único parcial uniq_location_per_company_name
        cur.execute(
            "INSERT INTO locations(name, company_id) "
            "VALUES (%s, %s) "
            "ON CONFLICT ON CONSTRAINT uniq_location_per_company_name "
            "DO UPDATE SET name=EXCLUDED.name "
            "RETURNING id",
            (location_name.strip(), company_id)
        )
        row = cur.fetchone()
        return int(row["id"])
