# Compila scs-telemetry.dll (Release x64) en la carpeta que se le pase.
# Lo usan los workflows (tests y "Build plugin") y sirve igual en una PC con
# Visual Studio y el workload de C++.
#
#   powershell -File plugin/build.ps1 -OutDir C:\algun\lado
#
# El .vcxproj pide el toolset v143 (Visual Studio 2022). Si la maquina tiene
# otro Visual Studio se usa el suyo: con el toolset fijo, el dia que el
# runner de GitHub pase a una version nueva el build se caeria sin que el
# codigo haya cambiado.
param(
    [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -property installationPath
$vsMajor = (& $vswhere -latest -products * -requires Microsoft.Component.MSBuild -property installationVersion).Split('.')[0]
$toolset = @{ '17' = 'v143'; '18' = 'v145' }[$vsMajor]
if (-not $toolset) { throw "Visual Studio $vsMajor sin toolset conocido: agregalo en plugin/build.ps1" }
$msbuild = Join-Path $vsPath 'MSBuild\Current\Bin\MSBuild.exe'

$project = Join-Path $PSScriptRoot 'scs-telemetry\vs2012\scs-telemetry.vcxproj'
$out = [System.IO.Path]::GetFullPath($OutDir).TrimEnd('\') + '\'
$obj = Join-Path ([System.IO.Path]::GetTempPath()) 'scs-telemetry-obj\'

Write-Host "Visual Studio $vsMajor, toolset $toolset"
& $msbuild $project -nologo -v:m -p:Configuration=Release -p:Platform=x64 `
    "-p:PlatformToolset=$toolset" "-p:OutDir=$out" "-p:IntDir=$obj"
if ($LASTEXITCODE -ne 0) { throw "msbuild fallo ($LASTEXITCODE)" }

$dll = Join-Path $out 'scs-telemetry.dll'
if (-not (Test-Path $dll)) { throw "no aparecio $dll" }
Write-Host "$dll"
Write-Host "SHA-256: $((Get-FileHash $dll -Algorithm SHA256).Hash.ToLower())"
