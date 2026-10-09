param([int]$StartStage = 0)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$blenderPath = 'C:/Users/rober/Documents/Codex/2026-10-09/b/work/tools/blender-4.5.4/blender-4.5.4-windows-x64/blender.exe'
$pythonPath = 'C:/Users/rober/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
Set-Location -LiteralPath $repoRoot
foreach ($stage in $StartStage..3) {
    $renderDir = "art-build/creatures/rex_$stage"
    $logPath = ".scratch/rex/export-$stage.log"
    $arguments = @('-b','-P',"tools/art/creatures/rex_$stage.py",'--','--mode','render','--samples','40','--out',$renderDir)
    if ($stage -gt 0) { $arguments += '--rebuild' }
    & $blenderPath @arguments *> $logPath
    if ($LASTEXITCODE -ne 0) { throw "Rex stage $stage render failed. See $logPath" }
    & $pythonPath tools/art/pack.py "$renderDir/frames.json" "public/art/creatures/rex_$stage" 92
    if ($LASTEXITCODE -ne 0) { throw "Rex stage $stage packing failed" }
    Write-Output "Rex stage $stage complete"
}
& $pythonPath tools/art/creatures/rex_mobile.py .
if ($LASTEXITCODE -ne 0) { throw 'Rex compact export failed' }
foreach ($stage in 0..3) {
    & $pythonPath tools/art/creatures/rex_review.py . $stage
    if ($LASTEXITCODE -ne 0) { throw "Rex stage $stage art verification failed" }
}
