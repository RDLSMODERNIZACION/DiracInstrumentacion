$ErrorActionPreference = "Stop"

$scada = ".\FrontEnd\App_Principal\src\components\scada\ScadaApp.tsx"

if (!(Test-Path $scada)) {
  throw "No encuentro $scada. Ejecuta desde la raiz de DiracInstrumentacion."
}

function Save-Utf8([string]$path,[string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path,$content,$enc)
}

Write-Host "Aplicando V18.61 - login admin UTF-8 + campos genericos..." -ForegroundColor Cyan

$s = [System.IO.File]::ReadAllText($scada)

$s = [regex]::Replace(
  $s,
  '<h2 className="mt-1 text-xl font-bold text-slate-900">\s*Administraci[^<]*\s*</h2>',
  '<h2 className="mt-1 text-xl font-bold text-slate-900">{"Administraci\u00f3n"}</h2>',
  1
)

$s = [regex]::Replace(
  $s,
  '<p className="mt-1 text-sm text-slate-500">\s*Ingres[^<]*credenciales administrativas para continuar\.\s*</p>',
  '<p className="mt-1 text-sm text-slate-500">{"Ingres\u00e1 las credenciales administrativas para continuar."}</p>',
  1
)

$s = [regex]::Replace(
  $s,
  '<label className="mb-1 block text-sm font-semibold text-slate-700">\s*Contrase[^<]*\s*</label>',
  '<label className="mb-1 block text-sm font-semibold text-slate-700">{"Contrase\u00f1a"}</label>',
  1
)

$s = [regex]::Replace(
  $s,
  'placeholder="Contrase[^"]*"',
  'placeholder={"Contrase\u00f1a"}',
  1
)

$s = [regex]::Replace(
  $s,
  '>\s*Entrar a Administraci[^<]*\s*</button>',
  '>{"Entrar a Administraci\u00f3n"}</button>',
  1
)

$s = [regex]::Replace(
  $s,
  'setAdminError\("Usuario o contrase[^"]* incorrectos"\);',
  'setAdminError("Usuario o contrase\u00f1a incorrectos");',
  1
)

$s = [regex]::Replace(
  $s,
  '<form\s+onSubmit=\{submitAdminLogin\}',
  '<form onSubmit={submitAdminLogin} autoComplete="off"',
  1
)

$s = [regex]::Replace(
  $s,
  'autoComplete="username"',
  'autoComplete="off"',
  1
)

$s = [regex]::Replace(
  $s,
  'autoComplete="current-password"',
  'autoComplete="new-password"',
  1
)

$s = [regex]::Replace(
  $s,
  'onClick=\{\(\) => setView\("admin"\)\}',
  'onClick={() => {' + "`r`n" +
  '                setAdminUsername("");' + "`r`n" +
  '                setAdminPassword("");' + "`r`n" +
  '                setAdminError("");' + "`r`n" +
  '                setView("admin");' + "`r`n" +
  '              }}',
  1
)

Save-Utf8 $scada $s

Write-Host ""
Write-Host "V18.61 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Cambios:" -ForegroundColor Cyan
Write-Host "- acentos corregidos usando escapes Unicode"
Write-Host "- usuario y clave vacios al abrir"
Write-Host "- autocomplete desactivado"
Write-Host "- sin usuario ni password sugeridos"
Write-Host ""
Write-Host "Proba:"
Write-Host "cd FrontEnd\App_Principal"
Write-Host "npm run build"
