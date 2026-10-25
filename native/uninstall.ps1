# Removes the YandexMusicPro native messaging host registration.
$ErrorActionPreference = 'SilentlyContinue'

foreach ($browser in @(
        'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ymp.files',
        'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.ymp.files'
    )) {
    Remove-Item -Path $browser -Recurse -Force
}

Remove-Item -Path (Join-Path $env:LOCALAPPDATA 'YandexMusicPro') -Recurse -Force
Write-Host 'YandexMusicPro helper removed.'
