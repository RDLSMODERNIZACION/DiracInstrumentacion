$ErrorActionPreference = "Stop"

$path = ".\Backend\app\main.py"

if (!(Test-Path $path)) {
    throw "No encuentro $path. Ejecutá desde la raíz de DiracInstrumentacion."
}

$txt = Get-Content $path -Raw

Write-Host "Aplicando V18.27 - CORS robusto para localhost y producción..." -ForegroundColor Cyan

# Reemplazar configuración CORS actual.
$pattern = '(?s)app\.add_middleware\(\s*CORSMiddleware,.*?\)\s*\n\s*app\.add_middleware\(GZipMiddleware'

$replacement = @'
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://www.diracserviciosenergia.com",
        "https://diracserviciosenergia.com",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
    expose_headers=["*"],
    max_age=3600,
)

app.add_middleware(GZipMiddleware
'@

$new = [regex]::Replace($txt, $pattern, $replacement, 1)

if ($new -eq $txt) {
    throw "No pude localizar el bloque CORSMiddleware actual en main.py."
}

$txt = $new

# Agregar handler global para que incluso los errores 500 salgan como respuesta FastAPI
# y puedan recibir headers CORS, en vez de aparecer solamente como 'Failed to fetch'.
$handlerMarker = '# ===== Global exception handler ====='

if (!$txt.Contains($handlerMarker)) {
    $anchor = '# ===== Health ====='

    if (!$txt.Contains($anchor)) {
        throw "No encontré el bloque Health para insertar el handler global."
    }

    $handler = @'
# ===== Global exception handler =====
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logging.exception(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(
        {
            "ok": False,
            "detail": str(exc),
            "path": request.url.path,
        },
        status_code=500,
    )


'@

    $txt = $txt.Replace($anchor, $handler + $anchor)
}

Set-Content $path $txt -Encoding UTF8

Write-Host ""
Write-Host "V18.27 aplicado correctamente." -ForegroundColor Green
Write-Host "Se habilitó localhost:5173/5174, 127.0.0.1, dominio DIRAC y previews Vercel." -ForegroundColor Green
Write-Host "También se agregó un handler para que los errores 500 no se oculten detrás de CORS." -ForegroundColor Cyan
Write-Host ""
Write-Host "Ahora subí el backend:" -ForegroundColor Yellow
Write-Host "git add Backend/app/main.py"
Write-Host 'git commit -m "fix cors for local reliability dashboard"'
Write-Host "git push"
