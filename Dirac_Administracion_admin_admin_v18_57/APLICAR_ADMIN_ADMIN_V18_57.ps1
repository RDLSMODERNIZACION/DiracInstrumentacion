$ErrorActionPreference = "Stop"

$auth  = ".\FrontEnd\Administracion\src\lib\auth.tsx"
$login = ".\FrontEnd\Administracion\src\pages\Login.tsx"

foreach ($f in @($auth,$login)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.57 - login Administracion admin / admin..." -ForegroundColor Cyan

# ============================================================
# 1) auth.tsx
#    Login local e independiente:
#    usuario admin
#    password admin
# ============================================================
$a = [System.IO.File]::ReadAllText($auth)

$pattern = '(?s)const login = useCallback\(async \(email: string, password: string\) => \{.*?\}, \[\]\);'

$replacement = @'
const login = useCallback(async (email: string, password: string) => {
    const username = email.trim().toLowerCase();

    if (username !== "admin" || password !== "admin") {
      throw new Error("Usuario o contraseña incorrectos");
    }

    // Sesion independiente de Administracion.
    // El token solo se usa como marcador de sesion del front administrativo.
    const token = buildBasicToken("admin", "admin");
    setState({ email: "admin", basicToken: token });
  }, []);
'@

$rx = New-Object System.Text.RegularExpressions.Regex(
  $pattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newA = $rx.Replace($a,$replacement,1)

if ($newA -eq $a) {
  throw "No pude localizar la funcion login en auth.tsx"
}

Save-Utf8 $auth $newA

# ============================================================
# 2) Login.tsx
#    Cambiar Email por Usuario, input text, vacio por defecto.
# ============================================================
$l = [System.IO.File]::ReadAllText($login)

$l = [regex]::Replace(
  $l,
  'const \[email,\s*setEmail\] = useState\("[^"]*"\);',
  'const [email, setEmail] = useState("");',
  1
)

$l = [regex]::Replace(
  $l,
  'const \[password,\s*setPassword\] = useState\("[^"]*"\);',
  'const [password, setPassword] = useState("");',
  1
)

$l = $l.Replace(
  '<label className="block text-sm font-medium mb-1">Email</label>',
  '<label className="block text-sm font-medium mb-1">Usuario</label>'
)

$l = [regex]::Replace(
  $l,
  '<input className="w-full border rounded px-3 py-2 mb-3" type="email"',
  '<input className="w-full border rounded px-3 py-2 mb-3" type="text" autocomplete="username"',
  1
)

$l = [regex]::Replace(
  $l,
  '<input className="w-full border rounded px-3 py-2 mb-2" type="password"',
  '<input className="w-full border rounded px-3 py-2 mb-2" type="password" autocomplete="current-password"',
  1
)

# Subtitulo
if ($l -notmatch 'Acceso de administracion') {
  $l = $l.Replace(
    '<h1 className="text-xl font-semibold mb-4">DIRAC — Administración</h1>',
    @'
<h1 className="text-xl font-semibold">DIRAC — Administración</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Acceso de administración.
        </p>
'@
  )
}

Save-Utf8 $login $l

Write-Host ""
Write-Host "V18.57 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Credenciales:" -ForegroundColor Yellow
Write-Host "Usuario: admin"
Write-Host "Clave:   admin"
Write-Host ""
Write-Host "Proba:"
Write-Host "cd FrontEnd\Administracion"
Write-Host "npm run build"
Write-Host ""
Write-Host "Luego build general:"
Write-Host "cd ..\App_Principal"
Write-Host "npm run build"
