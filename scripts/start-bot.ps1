$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$supervisorScript = Join-Path $PSScriptRoot 'supervisor.js'
$botProcess = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $supervisorScript + '"') -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru
Write-Output ('Bot supervisor launched. PID: ' + $botProcess.Id)
