$ErrorActionPreference = "Stop"

$scada = ".\FrontEnd\App_Principal\src\components\scada\ScadaApp.tsx"
$auth  = ".\FrontEnd\Administracion\src\lib\auth.tsx"

foreach ($f in @($scada,$auth)) {
  if (!(Test-Path $f)) {
    throw "No encuentro $f. Ejecuta desde la raiz de DiracInstrumentacion."
  }
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.58 - Administracion fullscreen + login obligatorio..." -ForegroundColor Cyan

# ============================================================
# 1) APP PRINCIPAL
#    Al tocar Administracion NO usa iframe.
#    Navega directamente a /admin/ y ocupa toda la pantalla.
# ============================================================
$s = [System.IO.File]::ReadAllText($scada)

# Funcion openAdministration dentro del componente.
if ($s -notmatch 'const openAdministration = React\.useCallback') {
  $anchor = '  const [view, setView] = React.useState<View>("operaciones"); // vista actual'
  if (!$s.Contains($anchor)) {
    throw "No encontre state view en ScadaApp.tsx"
  }

  $insert = @'

  const openAdministration = React.useCallback(() => {
    // Forzamos un login nuevo cada vez que se entra desde App_Principal.
    try {
      sessionStorage.removeItem("dirac.basic");
    } catch {}

    // Administracion se abre como aplicacion completa, no embebida.
    window.location.assign(app3Src);
  }, []);
'@

  $s = $s.Replace($anchor, $anchor + $insert)
}

# Menu Administracion: navegar, no setView("admin")
$s = [regex]::Replace(
  $s,
  '<NavItem label="Administración" active=\{view === "admin"\} onClick=\{\(\) => setView\("admin"\)\} />',
  '<NavItem label="Administración" active={false} onClick={openAdministration} />',
  1
)

# Fallback sin acento
$s = [regex]::Replace(
  $s,
  '<NavItem label="Administracion" active=\{view === "admin"\} onClick=\{\(\) => setView\("admin"\)\} />',
  '<NavItem label="Administracion" active={false} onClick={openAdministration} />',
  1
)

Save-Utf8 $scada $s

# ============================================================
# 2) ADMINISTRACION
#    La sesion NO se recupera al cargar/refrescar.
#    En produccion siempre muestra login al entrar de nuevo.
# ============================================================
$a = [System.IO.File]::ReadAllText($auth)

# Reemplazar inicializacion desde sessionStorage por estado vacio.
$statePattern = '(?s)const \[state, setState\] = useState<AuthState>\(\(\) => \{.*?\}\);'
$stateReplacement = 'const [state, setState] = useState<AuthState>({ email: null, basicToken: null });'

$rxState = New-Object System.Text.RegularExpressions.Regex(
  $statePattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newA = $rxState.Replace($a,$stateReplacement,1)

if ($newA -eq $a -and $a -notmatch 'useState<AuthState>\(\{ email: null, basicToken: null \}\)') {
  throw "No pude localizar la inicializacion de state en auth.tsx"
}

$a = $newA

# Eliminar persistencia automatica en sessionStorage.
$persistPattern = '(?s)\s*useEffect\(\(\) => \{\s*sessionStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\);\s*\}, \[state\]\);\s*'
$rxPersist = New-Object System.Text.RegularExpressions.Regex(
  $persistPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$a = $rxPersist.Replace($a,"`r`n",1)

# Logout ya puede limpiar por compatibilidad, no molesta.
Save-Utf8 $auth $a

Write-Host ""
Write-Host "V18.58 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Flujo final:" -ForegroundColor Cyan
Write-Host "App_Principal -> Administracion"
Write-Host "                -> sale de App_Principal"
Write-Host "                -> abre /admin/ a pantalla completa"
Write-Host "                -> pide usuario admin / clave admin"
Write-Host "                -> entra a Administracion completa"
Write-Host ""
Write-Host "La sidebar de App_Principal ya NO queda visible." -ForegroundColor Green
Write-Host "Al volver a entrar o refrescar /admin/, vuelve a pedir login." -ForegroundColor Green
Write-Host ""
Write-Host "Proba builds:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\Administracion"
Write-Host "npm run build"
Write-Host "cd ..\App_Principal"
Write-Host "npm run build"
