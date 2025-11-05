from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field
from app.db import get_conn

router = APIRouter(prefix="/dirac", tags=["dirac-users"])

class UserCreate(BaseModel):
    email: str
    full_name: str | None = None
    password: str = Field(min_length=4, max_length=128)
    status: str | None = "active"      # user_status_enum: active|disabled
    company_id: int | None = None
    role: str | None = "viewer"        # membership_role_enum
    is_primary: bool = False

@router.post("/users", summary="Crear usuario (simple/abierto)")
def create_user(payload: UserCreate):
    email = (payload.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "email requerido")

    status_in = (payload.status or "active").strip().lower()
    role_in   = (payload.role or "viewer").strip().lower()
    pwd_in    = payload.password

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # unicidad por email
        cur.execute("SELECT 1 FROM app_users WHERE lower(email)=%s", (email,))
        if cur.fetchone():
            raise HTTPException(409, "Email duplicado")

        try:
            # crear usuario
            cur.execute(
                """
                INSERT INTO app_users (email, full_name, status, password_plain)
                VALUES (%s, %s, %s::user_status_enum, %s)
                RETURNING id, email, full_name, status
                """,
                (email, payload.full_name, status_in, pwd_in),
            )
            u = cur.fetchone()

            # membresía opcional
            if payload.company_id is not None:
                cur.execute(
                    """
                    INSERT INTO company_users (company_id, user_id, role, is_primary)
                    VALUES (%s, %s, %s::membership_role_enum, %s)
                    ON CONFLICT (company_id, user_id)
                    DO UPDATE SET role=EXCLUDED.role, is_primary=EXCLUDED.is_primary
                    """,
                    (payload.company_id, u["id"], role_in, payload.is_primary),
                )

            conn.commit()
            return u
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create user error: {e}")
