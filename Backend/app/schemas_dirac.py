from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field

# Usuarios
class UserCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    password: str = Field(min_length=4, max_length=128)

class ChangePasswordIn(BaseModel):
    new_password: str = Field(min_length=4, max_length=128)

# Empresas
class CompanyCreate(BaseModel):
    name: str
    legal_name: Optional[str] = None
    cuit: Optional[str] = None

class CompanyUserAdd(BaseModel):
    user_id: int
    role: Literal["owner","admin","operator","technician","viewer"] = "viewer"
    is_primary: bool = False

# Localizaciones
class LocationCreate(BaseModel):
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    company_id: Optional[int] = None

class GrantAccessIn(BaseModel):
    access: Literal["view","control","admin"] = "view"

# Bombas
class PumpCommandIn(BaseModel):
    action: Literal["start","stop"]
    pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")
