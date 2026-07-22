!macro customInstall
  # Use modern PowerShell to add the firewall rule (installer already has Admin rights via UAC)
  DetailPrint "Configuring Windows Firewall (PowerShell)..."
  ExecWait 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command "New-NetFirewallRule -DisplayName \"ScenePlus+\" -Direction Inbound -Program \"$INSTDIR\ScenePlus+.exe\" -Action Allow -Profile Any -ErrorAction SilentlyContinue"'
!macroend

!macro customUnInstall
  # Clean up the firewall rule during uninstallation
  DetailPrint "Cleaning up Windows Firewall (PowerShell)..."
  ExecWait 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Remove-NetFirewallRule -DisplayName \"ScenePlus+\" -ErrorAction SilentlyContinue"'

  # Prompt user to delete user data in %APPDATA%\Roaming\sceneplus
  MessageBox MB_YESNO|MB_ICONQUESTION "ScenePlus+ のエフェクトデータおよび設定ファイル（%APPDATA%\sceneplus）も完全に削除しますか？" IDNO skip_appdata
    DetailPrint "Removing AppData Roaming directories..."
    RMDir /r "$APPDATA\sceneplus"
    RMDir /r "$APPDATA\ScenePlus+"
  skip_appdata:
!macroend
