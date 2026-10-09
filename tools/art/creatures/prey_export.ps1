$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$blenderPath='C:/Users/rober/Documents/Codex/2026-10-09/b/work/tools/blender-4.5.4/blender-4.5.4-windows-x64/blender.exe'
$pythonPath='C:/Users/rober/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
Set-Location -LiteralPath $repoRoot
foreach($creatureId in @('compy','hypsilophodon','oviraptor')){
  $renderDir="art-build/creatures/$creatureId"
  & $blenderPath -b -P tools/art/creatures/prey_render.py -- --id $creatureId --mode poses --samples 24 --out $renderDir *> ".scratch/prey-$creatureId-export.log"
  if($LASTEXITCODE -ne 0){throw "$creatureId render failed"}
  & $pythonPath tools/art/pack.py "$renderDir/frames.json" "public/art/creatures/$creatureId" 94
  if($LASTEXITCODE -ne 0){throw "$creatureId pack failed"}
  & $pythonPath tools/art/creatures/prey_review.py . $creatureId
  if($LASTEXITCODE -ne 0){throw "$creatureId verification failed"}
}
