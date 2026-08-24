$ErrorActionPreference = "Stop"

$scada = ".\FrontEnd\App_Principal\src\components\scada\ScadaApp.tsx"
$build = ".\FrontEnd\App_Principal\scripts\build-embedded.mjs"
$adminVite = ".\FrontEnd\Administracion\vite.config.ts"
$adminLogin = ".\FrontEnd\Administracion\src\pages\Login.tsx"

foreach ($f in @($scada,$build,$adminVite,$adminLogin)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.56 - Administracion accesible desde el menu..." -ForegroundColor Cyan

# ============================================================
# 1) App_Principal: sacar bloqueo previo
# ============================================================
$s = [System.IO.File]::ReadAllText($scada)

# Dev default correcto: Administracion usa 5178.
$s = $s.Replace(
  'import.meta.env.VITE_ADMIN_DEV ?? import.meta.env.VITE_APP3_DEV ?? "http://localhost:5176/"',
  'import.meta.env.VITE_ADMIN_DEV ?? import.meta.env.VITE_APP3_DEV ?? "http://localhost:5178/"'
)

# Remover cualquier bloqueo por canSeeAdmin/ownerOnlyBanner justo antes del iframe admin.
$pattern = 'if\s*\(!canSeeAdmin\)\s*return\s+ownerOnlyBanner;\s*return\s+<EmbeddedAppFrame\s+key=\{app3Src\}\s+src=\{app3Src\}\s+title="Administración"\s*/>;'
$replacement = 'return <EmbeddedAppFrame key={app3Src} src={app3Src} title="Administración" />;'

$rx = New-Object System.Text.RegularExpressions.Regex(
  $pattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$s = $rx.Replace($s,$replacement,1)

# Fallback sin acento, por si el archivo local quedo mojibake.
$pattern2 = 'if\s*\(!canSeeAdmin\)\s*return\s+ownerOnlyBanner;\s*return\s+<EmbeddedAppFrame\s+key=\{app3Src\}\s+src=\{app3Src\}\s+title="[^"]*"\s*/>;'
$rx2 = New-Object System.Text.RegularExpressions.Regex(
  $pattern2,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$s = $rx2.Replace(
  $s,
  'return <EmbeddedAppFrame key={app3Src} src={app3Src} title="Administracion" />;',
  1
)

# El banner puede quedar definido pero ya no se usa; no rompe.
Save-Utf8 $scada $s

# ============================================================
# 2) build-embedded: incluir FrontEnd/Administracion en /public/admin
# ============================================================
$b = [System.IO.File]::ReadAllText($build)

if ($b -notmatch '\.\./Administracion') {
  $b = $b.Replace(
    'const app2 = `${root}/../App_2`;',
    'const app2 = `${root}/../App_2`;' + "`r`n" +
    'const admin = `${root}/../Administracion`;'
  )
}

if ($b -notmatch 'Administracion \(login propio\)') {
  $anchor = '// ==== Mapa (NUEVO, sin iframe) ===='
  $pos = $b.IndexOf($anchor)
  if ($pos -lt 0) {
    $anchor = '// ==== Mapa'
    $pos = $b.IndexOf($anchor)
  }
  if ($pos -lt 0) {
    throw "No encontre el bloque Mapa en build-embedded.mjs"
  }

  $adminBlock = @'
// ==== Administracion (login propio) ====
cleanInstall(admin);
run("npm run build", admin);
if (!existsSync(`${root}/public/admin`))
  mkdirSync(`${root}/public/admin`, { recursive: true });
cpSync(`${admin}/dist`, `${root}/public/admin`, { recursive: true });

'@

  $b = $b.Insert($pos,$adminBlock)
}

$b = $b.Replace(
  'Apps copiadas a /public (kpi/, infraestructura/ y mapa/)',
  'Apps copiadas a /public (kpi/, infraestructura/, admin/ y mapa/)'
)

Save-Utf8 $build $b

# ============================================================
# 3) Administracion: base /admin/ en produccion
# ============================================================
$v = [System.IO.File]::ReadAllText($adminVite)

if ($v -notmatch 'base:') {
  $v = $v.Replace(
    'export default defineConfig({',
    'export default defineConfig({' + "`r`n" +
    "  base: process.env.NODE_ENV === 'production' ? '/admin/' : '/',"
  )
}

Save-Utf8 $adminVite $v

# ============================================================
# 4) Login Admin: no dejar credenciales precargadas
# ============================================================
$l = [System.IO.File]::ReadAllText($adminLogin)

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

Save-Utf8 $adminLogin $l

Write-Host ""
Write-Host "V18.56 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora:" -ForegroundColor Cyan
Write-Host "- Tocar Administracion en App_Principal carga /admin/"
Write-Host "- Ya no aparece el cartel de permisos de App_Principal"
Write-Host "- /admin/ muestra el login propio de FrontEnd/Administracion"
Write-Host "- El build de App_Principal ahora compila y copia Administracion"
Write-Host "- Dev default de Administracion: http://localhost:5178/"
Write-Host ""
Write-Host "Prueba completa:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
Write-Host ""
Write-Host "En dev, para tener ambas apps:"
Write-Host "Terminal 1: cd FrontEnd\Administracion ; npm run dev"
Write-Host "Terminal 2: cd FrontEnd\App_Principal ; npm run dev"
