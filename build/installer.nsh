!macro customInstall
  # Use modern PowerShell to add the firewall rule (installer already has Admin rights via UAC)
  DetailPrint "Configuring Windows Firewall (PowerShell)..."
  ExecWait 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command "New-NetFirewallRule -DisplayName \"ScenePlus+\" -Direction Inbound -Program \"$INSTDIR\ScenePlus+.exe\" -Action Allow -Profile Any -ErrorAction SilentlyContinue"'
!macroend

!macro customUnInstall
  # Clean up the firewall rule during uninstallation
  DetailPrint "Cleaning up Windows Firewall (PowerShell)..."
  ExecWait 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Remove-NetFirewallRule -DisplayName \"ScenePlus+\" -ErrorAction SilentlyContinue"'
!macroend
