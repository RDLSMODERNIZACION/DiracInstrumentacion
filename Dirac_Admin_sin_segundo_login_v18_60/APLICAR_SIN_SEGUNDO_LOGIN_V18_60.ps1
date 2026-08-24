$ErrorActionPreference = "Stop"

$app = ".\FrontEnd\Administracion\src\pages\App.tsx"

if (!(Test-Path $app)) {
  throw "No encuentro $app. Ejecuta desde la raiz de DiracInstrumentacion."
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.60 - quitar segundo login de Administracion..." -ForegroundColor Cyan

$txt = [System.IO.File]::ReadAllText($app)

# Quitar import del login y useAuth si ya no se usan.
$txt = [regex]::Replace(
  $txt,
  'import \{ useAuth \} from "\.\./lib/auth";\s*',
  '',
  1
)

$txt = [regex]::Replace(
  $txt,
  'import Login from "\./Login";\s*',
  '',
  1
)

# Quitar el gate:
# const { isAuthenticated } = useAuth();
# if (!isAuthenticated) return <Login />;
$txt = [regex]::Replace(
  $txt,
  '(?s)\s*const \{ isAuthenticated \} = useAuth\(\);\s*if \(!isAuthenticated\) return <Login />;\s*',
  "`r`n",
  1
)

Save-Utf8 $app $txt

Write-Host ""
Write-Host "V18.60 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Flujo:" -ForegroundColor Cyan
Write-Host "App_Principal -> Administracion -> login admin/admin -> /admin/ -> panel directo"
Write-Host ""
Write-Host "Ya no existe el segundo login dentro de FrontEnd/Administracion." -ForegroundColor Green
Write-Host ""
Write-Host "Proba:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\Administracion"
Write-Host "npm run build"
Write-Host "cd ..\App_Principal"
Write-Host "npm run build"
