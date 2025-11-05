@router.post(
    "",
    summary="Crear/actualizar localización (idempotente por (company_id, name))",
    description="Si (company_id, name) ya existe, actualiza address/lat/lon y devuelve el mismo id."
)
def create_location(payload: LocationCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Si viene empresa, el usuario debe ser owner/admin EN ESA empresa
        if payload.company_id:
            cur.execute(
                "SELECT EXISTS(SELECT 1 FROM company_users "
                "WHERE company_id=%s AND user_id=%s AND role IN ('owner','admin')) AS ok",
                (payload.company_id, user["user_id"])
            )
            if not cur.fetchone()["ok"]:
                raise HTTPException(403, "Requiere owner/admin en la empresa")

        try:
            if payload.company_id is None:
                # Sin empresa: insert simple (no hay índice único parcial)
                cur.execute(
                    "INSERT INTO locations(name, address, lat, lon, company_id) "
                    "VALUES(%s,%s,%s,%s,%s) "
                    "RETURNING id, name, company_id",
                    (payload.name, payload.address, payload.lat, payload.lon, None)
                )
                row = cur.fetchone()
                conn.commit()
                return row

            # Con empresa: idempotente por (company_id, name) SIN usar nombre del constraint
            # 1) ¿Existe?
            cur.execute(
                "SELECT id FROM locations WHERE company_id=%s AND name=%s",
                (payload.company_id, payload.name)
            )
            found = cur.fetchone()

            if found:
                # 2) Update COALESCE (solo pisa si mandás dato)
                cur.execute(
                    "UPDATE locations SET "
                    " address = COALESCE(%s, address),"
                    " lat     = COALESCE(%s, lat),"
                    " lon     = COALESCE(%s, lon)"
                    " WHERE id=%s "
                    " RETURNING id, name, company_id",
                    (payload.address, payload.lat, payload.lon, found["id"])
                )
                row = cur.fetchone()
                conn.commit()
                return row
            else:
                # 3) Insert nuevo
                cur.execute(
                    "INSERT INTO locations(name, address, lat, lon, company_id) "
                    "VALUES(%s,%s,%s,%s,%s) "
                    "RETURNING id, name, company_id",
                    (payload.name, payload.address, payload.lat, payload.lon, payload.company_id)
                )
                row = cur.fetchone()
                conn.commit()
                return row

        except Exception as e:
            conn.rollback()
            # 400 con detalle (así ves el motivo real si hubiera otra constraint)
            raise HTTPException(400, f"Create location error: {e}")
