from pathlib import Path
import re

repo = Path.cwd()

infra = repo / "FrontEnd/App_2/src/features/infra-diagram/InfraDiagram.tsx"
edge = repo / "FrontEnd/App_2/src/features/infra-diagram/components/edges/EditableEdge.tsx"
service = repo / "FrontEnd/App_2/src/features/infra-diagram/services/pumpTaps.ts"
backend = repo / "Backend/app/routes/infraestructura/pump_taps.py"

for f in [infra, edge]:
    if not f.exists():
        raise SystemExit(f"No encuentro {f}. Ejecutá desde la raíz de DiracInstrumentacion.")

# =========================================================
# 1) InfraDiagram
#    - desactivar logger general
#    - conservar SOLO logs [PUMP-TAP]
# =========================================================
i = infra.read_text(encoding="utf-8-sig")

# Desactivar helper general de debug
i = re.sub(
    r'function isDebugEnabled\(\): boolean \{[\s\S]*?\n\}',
    'function isDebugEnabled(): boolean {\n  return false;\n}',
    i,
    count=1
)

# Eliminar console.log / console.warn de una sola línea que NO sean PUMP-TAP.
lines = i.splitlines()
clean = []
for line in lines:
    stripped = line.strip()
    if ("console.log(" in stripped or "console.warn(" in stripped) and "[PUMP-TAP]" not in stripped:
        continue
    clean.append(line)
i = "\n".join(clean) + "\n"

infra.write_text(i, encoding="utf-8")

# =========================================================
# 2) EditableEdge
#    - apagar DEBUG_EDGE
#    - conservar SOLO logs [PUMP-TAP]
# =========================================================
e = edge.read_text(encoding="utf-8-sig")

e = e.replace("const DEBUG_EDGE = true;", "const DEBUG_EDGE = false;")

lines = e.splitlines()
clean = []
for line in lines:
    stripped = line.strip()
    if ("console.log(" in stripped or "console.warn(" in stripped) and "[PUMP-TAP]" not in stripped:
        continue
    clean.append(line)
e = "\n".join(clean) + "\n"

edge.write_text(e, encoding="utf-8")

# =========================================================
# 3) pumpTaps.ts
#    - mantener logs PUMP-TAP
#    - sacar cualquier otro log/warn
# =========================================================
if service.exists():
    s = service.read_text(encoding="utf-8-sig")
    lines = s.splitlines()
    clean = []
    for line in lines:
        stripped = line.strip()
        if ("console.log(" in stripped or "console.warn(" in stripped) and "[PUMP-TAP]" not in stripped:
            continue
        clean.append(line)
    service.write_text("\n".join(clean) + "\n", encoding="utf-8")

# =========================================================
# 4) backend pump_taps.py
#    - mantener prints PUMP-TAP
#    - no tocar errores reales
# =========================================================
if backend.exists():
    b = backend.read_text(encoding="utf-8-sig")
    lines = b.splitlines()
    clean = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("print(") and "[PUMP-TAP]" not in stripped:
            continue
        clean.append(line)
    backend.write_text("\n".join(clean) + "\n", encoding="utf-8")

print("Logs limpiados. Se conservaron únicamente los diagnósticos [PUMP-TAP].")
