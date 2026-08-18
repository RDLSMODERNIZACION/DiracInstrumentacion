from pathlib import Path

p=Path.cwd()/"vercel.json"
if not p.exists():
    raise SystemExit("ERROR: ejecutá esto desde FrontEnd/App_Principal")

t=p.read_text(encoding="utf-8")
old="https://dirac-admin-5irp03cir-tecnologiainnovacions-projects.vercel.app"
new="https://dirac-admin.vercel.app"
if old not in t:
    raise SystemExit("ERROR: no encontré la URL anterior del admin en vercel.json")
t=t.replace(old,new)
p.write_text(t,encoding="utf-8")
print("OK: vercel.json ahora apunta a https://dirac-admin.vercel.app/admin")
