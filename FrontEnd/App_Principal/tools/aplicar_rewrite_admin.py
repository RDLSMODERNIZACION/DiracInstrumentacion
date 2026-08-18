from pathlib import Path
import json, sys

if len(sys.argv) < 2:
    raise SystemExit("USO: python tools/aplicar_rewrite_admin.py https://TU-ADMIN.vercel.app")

admin = sys.argv[1].rstrip("/")
if not admin.startswith("https://"):
    raise SystemExit("ERROR: la URL debe empezar con https://")

root = Path.cwd()
# Se espera ejecutar desde FrontEnd/App_Principal
if not (root / "package.json").exists():
    raise SystemExit("ERROR: ejecutá desde FrontEnd/App_Principal")

config = {
    "rewrites": [
        {
            "source": "/admin",
            "destination": f"{admin}/admin"
        },
        {
            "source": "/admin/:path*",
            "destination": f"{admin}/admin/:path*"
        }
    ]
}

(root / "vercel.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
print(f"OK: /admin será proxy hacia {admin}/admin")
