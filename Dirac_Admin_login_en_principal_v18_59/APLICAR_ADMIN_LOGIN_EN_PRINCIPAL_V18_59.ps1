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

Write-Host "Aplicando V18.59 - login Admin dentro de App_Principal..." -ForegroundColor Cyan

# ============================================================
# 1) APP PRINCIPAL
# ============================================================
$s = [System.IO.File]::ReadAllText($scada)

# Asegurar que el menu Administracion cambie a view=admin
$s = [regex]::Replace(
  $s,
  '<NavItem label="Administración" active=\{[^}]+\} onClick=\{openAdministration\} />',
  '<NavItem label="Administración" active={view === "admin"} onClick={() => setView("admin")} />',
  1
)

$s = [regex]::Replace(
  $s,
  '<NavItem label="Administracion" active=\{[^}]+\} onClick=\{openAdministration\} />',
  '<NavItem label="Administracion" active={view === "admin"} onClick={() => setView("admin")} />',
  1
)

# Si sigue la version original, ya esta bien; no tocar.
# Eliminar callback openAdministration si existe, para no dejar codigo muerto raro.
$openPattern = '(?s)\s*const openAdministration = React\.useCallback\(\(\) => \{.*?\}, \[\]\);\s*'
$rxOpen = New-Object System.Text.RegularExpressions.Regex(
  $openPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$s = $rxOpen.Replace($s,"`r`n",1)

# Estados del login administrativo dentro de ScadaApp.
if ($s -notmatch 'adminUsername') {
  $anchor = '  const [view, setView] = React.useState<View>("operaciones");'
  $pos = $s.IndexOf($anchor)
  if ($pos -lt 0) {
    $anchor = 'const [view, setView] = React.useState<View>("operaciones");'
    $pos = $s.IndexOf($anchor)
  }
  if ($pos -lt 0) {
    throw "No encontre el state view en ScadaApp.tsx"
  }

  $insertAt = $pos + $anchor.Length

  $loginState = @'

  const [adminUsername, setAdminUsername] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [adminError, setAdminError] = React.useState("");

  const submitAdminLogin = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setAdminError("");

      if (
        adminUsername.trim().toLowerCase() !== "admin" ||
        adminPassword !== "admin"
      ) {
        setAdminError("Usuario o contraseña incorrectos");
        return;
      }

      try {
        // Handoff de una sola vez para que /admin/ entre sin pedir login otra vez.
        sessionStorage.setItem("dirac.admin.handoff", "1");
      } catch {}

      window.location.assign(app3Src);
    },
    [adminUsername, adminPassword]
  );
'@

  $s = $s.Insert($insertAt,$loginState)
}

# Reemplazar la rama final de mainBody (admin) por formulario dentro de App_Principal.
# Cubre version embebida y version fullscreen previa.
$mainPattern = '(?s)(if \(view === "infra"\) \{.*?\n\s*\})(?:\s*if \(!canSeeAdmin\) return ownerOnlyBanner;)?\s*return <EmbeddedAppFrame key=\{app3Src\} src=\{app3Src\} title="[^"]*" />;'

$adminLoginBlock = @'
$1

    return (
      <div className="min-h-[calc(100vh-58px)] bg-slate-50 px-4 py-10">
        <div className="mx-auto w-full max-w-sm">
          <form
            onSubmit={submitAdminLogin}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                Acceso restringido
              </div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                Administración
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Ingresá las credenciales administrativas para continuar.
              </p>
            </div>

            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Usuario
            </label>
            <input
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              autoComplete="username"
              className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              placeholder="Usuario"
            />

            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Contraseña
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
              placeholder="Contraseña"
            />

            {adminError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {adminError}
              </div>
            ) : null}

            <button
              type="submit"
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Entrar a Administración
            </button>
          </form>
        </div>
      </div>
    );
'@

$rxMain = New-Object System.Text.RegularExpressions.Regex(
  $mainPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newS = $rxMain.Replace($s,$adminLoginBlock,1)

if ($newS -eq $s) {
  throw "No pude localizar la rama Administracion dentro de mainBody."
}

Save-Utf8 $scada $newS

# ============================================================
# 2) FRONTEND ADMINISTRACION
#    Consumir handoff una sola vez y entrar directo despues del login principal.
# ============================================================
$a = [System.IO.File]::ReadAllText($auth)

# Reemplazar cualquier inicializacion del state por handoff-aware.
$statePattern = '(?s)const \[state, setState\] = useState<AuthState>\((?:\(\) => \{.*?\}|\{.*?\})\);'

$stateReplacement = @'
const [state, setState] = useState<AuthState>(() => {
    try {
      const handoff = sessionStorage.getItem("dirac.admin.handoff");
      if (handoff === "1") {
        sessionStorage.removeItem("dirac.admin.handoff");
        return {
          email: "admin",
          basicToken: buildBasicToken("admin", "admin"),
        };
      }
    } catch {}

    return { email: null, basicToken: null };
  });
'@

$rxState = New-Object System.Text.RegularExpressions.Regex(
  $statePattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$newA = $rxState.Replace($a,$stateReplacement,1)

if ($newA -eq $a) {
  throw "No pude localizar la inicializacion de auth state en Administracion."
}

# No persistir la sesion del admin entre accesos.
$persistPattern = '(?s)\s*useEffect\(\(\) => \{\s*sessionStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\);\s*\}, \[state\]\);\s*'
$rxPersist = New-Object System.Text.RegularExpressions.Regex(
  $persistPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$newA = $rxPersist.Replace($newA,"`r`n",1)

Save-Utf8 $auth $newA

Write-Host ""
Write-Host "V18.59 aplicado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Flujo final:" -ForegroundColor Cyan
Write-Host "1. En App_Principal tocas Administracion."
Write-Host "2. App_Principal muestra LOGIN admin/admin."
Write-Host "3. Si es correcto, navega a /admin/."
Write-Host "4. /admin/ abre directamente el panel completo."
Write-Host "5. No vuelve a pedir un segundo login."
Write-Host "6. Si entras directo a /admin/ sin pasar por App_Principal, pide login."
Write-Host ""
Write-Host "Credenciales:"
Write-Host "Usuario: admin"
Write-Host "Clave:   admin"
Write-Host ""
Write-Host "Proba builds:" -ForegroundColor Yellow
Write-Host "cd FrontEnd\Administracion"
Write-Host "npm run build"
Write-Host "cd ..\App_Principal"
Write-Host "npm run build"
