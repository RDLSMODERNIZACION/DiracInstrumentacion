# app/routes/ingest.py
import logging
import time

from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row
import psycopg

from app.db import get_conn
from app.schemas import TankIngestIn, TankIngestOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/tank", response_model=TankIngestOut)
def ingest_tank(body: TankIngestIn):
    """
    Inserta una lectura para un tanque.
    Requiere: tank_id, level_pct (0..100).
    created_at es opcional (default NOW()).
    """
    sql_insert = """
    insert into public.tank_ingest (tank_id, level_pct, created_at)
    values (%s, %s, coalesce(%s, now()))
    returning id, tank_id, level_pct, created_at
    """

    t0 = time.perf_counter()

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            # Limitar cuánto puede tardar la query en la DB (ej: 5 s)
            try:
                cur.execute("SET LOCAL statement_timeout = 5000;")
            except Exception:
                logger.warning(
                    "No se pudo setear statement_timeout local en ingest_tank",
                    exc_info=True,
                )

            cur.execute(
                sql_insert,
                (body.tank_id, body.level_pct, body.created_at),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(
                    status_code=500,
                    detail="No se obtuvo fila de tank_ingest",
                )

            # Normalizamos level_pct a float para JSON
            if row["level_pct"] is not None:
                row["level_pct"] = float(row["level_pct"])

            dt = time.perf_counter() - t0
            logger.info(
                "ingest_tank tank_id=%s level_pct=%s tardó %.3f s",
                body.tank_id,
                body.level_pct,
                dt,
            )

            return row

    except psycopg.errors.ForeignKeyViolation:
        # Si el tank_id no existe, el FK falla
        logger.warning(
            "ForeignKeyViolation en ingest_tank para tank_id=%s",
            body.tank_id,
            exc_info=True,
        )
        raise HTTPException(
            status_code=400,
            detail=f"tank_id={body.tank_id} no existe",
        )

    except psycopg.OperationalError:
        # Problemas de red / conexión con la DB
        logger.exception("Error operacional de DB en ingest_tank")
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible",
        )

    except HTTPException:
        # Repropagar HTTPException tal cual
        raise

    except Exception:
        logger.exception("Error no esperado en ingest_tank")
        raise HTTPException(
            status_code=500,
            detail="Error interno en ingest_tank",
        )


@router.get("/tank/latest/{tank_id}", response_model=TankIngestOut)
def get_tank_latest(tank_id: int):
    """
    Devuelve la última lectura (por created_at desc) para un tanque.
    """
    sql_select = """
    select id, tank_id, level_pct, created_at
    from public.tank_ingest
    where tank_id = %s
    order by created_at desc, id desc
    limit 1
    """

    t0 = time.perf_counter()

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            # Limita tiempo de la query también aquí
            try:
                cur.execute("SET LOCAL statement_timeout = 5000;")
            except Exception:
                logger.warning(
                    "No se pudo setear statement_timeout local en get_tank_latest",
                    exc_info=True,
                )

            cur.execute(sql_select, (tank_id,))
            row = cur.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Sin lecturas",
                )

            if row["level_pct"] is not None:
                row["level_pct"] = float(row["level_pct"])

            dt = time.perf_counter() - t0
            logger.info(
                "get_tank_latest tank_id=%s tardó %.3f s",
                tank_id,
                dt,
            )

            return row

    except psycopg.OperationalError:
        logger.exception("Error operacional de DB en get_tank_latest")
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible",
        )

    except HTTPException:
        # Ya tiene código y detalle correcto
        raise

    except Exception:
        logger.exception("Error no esperado en get_tank_latest")
        raise HTTPException(
            status_code=500,
            detail="Error interno en get_tank_latest",
        )
