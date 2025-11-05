# app/routes/dirac_admin/location_utils.py
from fastapi import HTTPException
from psycopg.rows import dict_row

def _is_superadmin(cur, user_id: int) -> bool:
    """
    Lee el flag global desde public.app_users (o vista equivalente).
    """
    cur.execute(
        "SELECT COALESCE(is_superadmin,false) AS sa FROM public.app_users WHERE id=%s",
        (user_id,),
    )
    row = cur.fetchone()
    return bool(row and row["sa"])


def _assert_user_is_company_admin(cur, user_id: int, company_id: int) -> None:
    """
    Requiere owner/admin en la empresa, salvo que sea superadmin (bypass).
    """
    if _is_superadmin(cur, user_id):
        return
    cur.execute(
        """
        SELECT EXISTS(
          SELECT 1 FROM company_users
          WHERE user_id=%s AND company_id=%s
            AND role IN ('owner','admin')
        ) AS ok
        """,
        (user_id, company_id),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(403, "Se requiere owner/admin en la empresa (o superadmin)")


def ensure_location_id(
    conn,
    user_id: int,
    location_id: int | None,
    company_id: int | None,
    location_name: str | None,
) -> int | None:
    """
    Devuelve un location_id válido (idempotente).
    - Si viene location_id: valida existencia y permiso en su empresa.
    - Si NO viene: crea/usa la localización por (company_id, location_name) con UPSERT.
    - Si no hay datos suficientes, devuelve None (el caller decide si acepta NULL).
    """
    with conn.cursor(row_factory=dict_row) as cur:
        # Caso 1: ya me pasaron un ID de localización
        if location_id is not None:
            cur.execute("SELECT id, company_id FROM locations WHERE id=%s", (location_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(400, f"location_id={location_id} no existe")
            if row["company_id"] is not None:
                _assert_user_is_company_admin(cur, user_id, row["company_id"])
            return int(row["id"])

        # Caso 2: necesito crear/usar por (company_id, name)
        if not company_id or not (location_name or "").strip():
            return None

        name = location_name.strip()
        _assert_user_is_company_admin(cur, user_id, company_id)

        # Requiere índice/constraint único parcial:
        # CREATE UNIQUE INDEX IF NOT EXISTS uniq_location_per_company_name
        #   ON public.locations(company_id, name) WHERE company_id IS NOT NULL;
        # Usamos el nombre del constraint para que sea idempotente.
        try:
            cur.execute(
                """
                INSERT INTO locations(name, company_id)
                VALUES (%s, %s)
                ON CONFLICT ON CONSTRAINT uniq_location_per_company_name
                DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                """,
                (name, company_id),
            )
            rid = cur.fetchone()["id"]
            return int(rid)
        except Exception:
            # Fallback defensivo por si el constraint no existe aún:
            cur.execute(
                "SELECT id FROM locations WHERE company_id=%s AND name=%s",
                (company_id, name),
            )
            row = cur.fetchone()
            if row:
                return int(row["id"])
            cur.execute(
                "INSERT INTO locations(name, company_id) VALUES (%s, %s) RETURNING id",
                (name, company_id),
            )
            return int(cur.fetchone()["id"])
