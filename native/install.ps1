# Registers the YandexMusicPro local helper as a Chrome native messaging host.
# Run:  powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = 'Stop'

$extensionId = 'hjcmcnhpcefhhkhgcfjmodggncllnedo'
$helperDir = Join-Path $env:LOCALAPPDATA 'YandexMusicPro\helper'

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    throw 'Node.js was not found in PATH. Install Node.js (https://nodejs.org) and run this script again.'
}

New-Item -ItemType Directory -Force -Path $helperDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'host.js') (Join-Path $helperDir 'host.js') -Force

$cmdPath = Join-Path $helperDir 'host.cmd'
$cmdText = "@echo off`r`n`"$node`" `"%~dp0host.js`"`r`n"
Set-Content -Path $cmdPath -Value $cmdText -Encoding ASCII -NoNewline

$manifestPath = Join-Path $helperDir 'com.ymp.files.json'
$manifest = [ordered]@{
    name            = 'com.ymp.files'
    description     = 'YandexMusicPro local files helper'
    path            = $cmdPath
    type            = 'stdio'
    allowed_origins = @("chrome-extension://$extensionId/")
}
$json = $manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))

foreach ($browser in @(
        'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ymp.files',
        'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.ymp.files'
    )) {
    New-Item -Path $browser -Force | Out-Null
    Set-ItemProperty -Path $browser -Name '(default)' -Value $manifestPath
}

Write-Host ''
Write-Host 'YandexMusicPro helper installed.' -ForegroundColor Green
Write-Host "  helper : $helperDir"
Write-Host "  node   : $node"
Write-Host "  ext id : $extensionId"
Write-Host ''
Write-Host 'Now load the unpacked extension at chrome://extensions (Developer mode -> Load unpacked).'
