$res = Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "E:\workspace\release\verify_install\localbridge-desktop.exe", "E:\workspace\release\verify_install"
$res | Select-Object ProcessId, ReturnValue
Start-Sleep -Seconds 8
Get-NetTCPConnection -LocalPort 18080, 8787, 8080, 20705 -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, State, OwningProcess
