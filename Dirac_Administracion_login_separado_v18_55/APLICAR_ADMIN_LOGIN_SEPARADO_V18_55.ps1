$ErrorActionPreference = "Stop"

$scada = ".\FrontEnd\App_Principal\src\components\scada\ScadaApp.tsx"
$auth  = ".\FrontEnd\Administracion\src\lib\auth.tsx"
$login = ".\FrontEnd\Administracion\src\pages\Login.tsx"
$vite  = ".\FrontEnd\Administracion\vite.config.ts"

foreach ($f in @($scada,$auth,$login,$vite)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.55 - login separado para Administracion..." -ForegroundColor Cyan

# ============================================================
# 1) APP PRINCIPAL
#    Administracion siempre abre la app embebida.
#    La seguridad pasa a estar en el login propio de Administracion.
# ============================================================
$s = [System.IO.File]::ReadAllText($scada)

# Quitar bloqueo ownerOnly al render de admin.
$s = $s.Replace(
  '    if (!canSeeAdmin) return ownerOnlyBanner;' + "`r`n" +
  '    return <EmbeddedAppFrame key={app3Src} src={app3Src} title="Administración" />;',
  '    return <EmbeddedAppFrame key={app3Src} src={app3Src} title="Administración" />;'
)

$s = $s.Replace(
  '    if (!canSeeAdmin) return ownerOnlyBanner;' + "`n" +
  '    return <EmbeddedAppFrame key={app3Src} src={app3Src} title="Administración" />;',
  '    return <EmbeddedAppFrame key={app3Src} src={app3Src} title="Administración" />;'
)

# Si no encontro exacto, regex.
$s = [regex]::Replace(
  $s,
  'if \(!canSeeAdmin\) return ownerOnlyBanner;\s*return <EmbeddedAppFrame key=\{app3Src\} src=\{app3Src\} title="Administración" />;',
  'return <EmbeddedAppFrame key={app3Src} src={app3Src} title="Administración" />;',
  1
)

Save-Utf8 $scada $s

# ============================================================
# 2) ADMIN AUTH
#    Login independiente y validacion de rol.
#    Permitidos: superadmin o role owner/admin en alguna empresa.
# ============================================================
$a = [System.IO.File]::ReadAllText($auth)

$oldLoginPattern = '(?s)const login = useCallback\(async \(email: string, password: string\) => \{.*?setState\(\{ email, basicToken: token \}\);\s*\}, \[\]\);'

$newLogin = @'
const login = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim();
    const token = buildBasicToken(cleanEmail, password);
    const api = getApiBase();

    // Primero validamos credenciales y obtenemos el perfil real.
    const res = await fetch(`${api}/dirac/me`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
      },
      cache: "no-store",
    });

    if (res.status === 401) throw new Error("Credenciales invalidas");
    if (!res.ok) throw new Error(`Error de autenticacion (${res.status})`);

    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      throw new Error("La URL de API no devuelve JSON.");
    }

    const me = await res.json();

    const isSuperadmin = Boolean(me?.user?.is_superadmin);
    const companies = Array.isArray(me?.companies) ? me.companies : [];
    const hasAdminRole = companies.some((c: any) => {
      const role = String(c?.role ?? "").trim().toLowerCase();
      return role === "owner" || role === "admin";
    });

    if (!isSuperadmin && !hasAdminRole) {
      throw new Error(
        "Usuario valido, pero sin permisos de Administracion."
      );
    }

    // Token separado del login de Operaciones.
    setState({ email: cleanEmail, basicToken: token });
  }, []);
'@

$rxLogin = New-Object System.Text.RegularExpressions.Regex(
  $oldLoginPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newA = $rxLogin.Replace($a,$newLogin,1)

if ($newA -eq $a) {
  throw "No pude localizar la funcion login en Administracion/src/lib/auth.tsx"
}

Save-Utf8 $auth $newA

# ============================================================
# 3) LOGIN UI
#    Sin credenciales precargadas.
# ============================================================
$l = [System.IO.File]::ReadAllText($login)

$l = [regex]::Replace(
  $l,
  'const \[email, setEmail\] = useState\("[^"]*"\);',
  'const [email, setEmail] = useState("");',
  1
)

$l = [regex]::Replace(
  $l,
  'const \[password, setPassword\] = useState\("[^"]*"\);',
  'const [password, setPassword] = useState("");',
  1
)

# Mejorar titulo/subtitulo si no existe.
if ($l -notmatch 'Acceso independiente') {
  $l = $l.Replace(
    '<h1 className="text-xl font-semibold mb-4">DIRAC — Administración</h1>',
    @'
<h1 className="text-xl font-semibold">DIRAC — Administración</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Acceso independiente para usuarios administradores.
        </p>
'@
  )
}

Save-Utf8 $login $l

# ============================================================
# 4) VITE ADMIN
#    Base /admin/ en produccion para funcionar embebido.
# ============================================================
$v = [System.IO.File]::ReadAllText($vite)

if ($v -notmatch 'base:') {
  $v = $v.Replace(
    'export default defineConfig({' + "`r`n",
    'export default defineConfig({' + "`r`n" +
    "  base: process.env.NODE_ENV === 'production' ? '/admin/' : '/'," + "`r`n"
  )
  $v = $v.Replace(
    'export default defineConfig({' + "`n",
    'export default defineConfig({' + "`n" +
    "  base: process.env.NODE_ENV === 'production' ? '/admin/' : '/'," + "`n"
  )
}

Save-Utf8 $vite $v

Write-Host ""
Write-Host "V18.55 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Flujo nuevo:" -ForegroundColor Cyan
Write-Host "1. Usuario entra a App Principal con su login normal."
Write-Host "2. Toca Administracion."
Write-Host "3. Se carga FrontEnd/Administracion dentro de /admin/."
Write-Host "4. Administracion muestra SU PROPIO login."
Write-Host "5. Solo acepta superadmin o role owner/admin."
Write-Host ""
Write-Host "Ya no aparece el cartel de permisos de App Principal." -ForegroundColor Green
Write-Host ""
Write-Host "Builds a probar:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\Administracion"
Write-Host "npm run build"
Write-Host "cd ..\App_Principal"
Write-Host "npm run build"
