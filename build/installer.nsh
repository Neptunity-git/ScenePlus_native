!macro customInstall
  # Use modern PowerShell to add the firewall rule (installer already has Admin rights via UAC)
  DetailPrint "Configuring Windows Firewall (PowerShell)..."
  ExecWait 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command "New-NetFirewallRule -DisplayName \"ScenePlus+\" -Direction Inbound -Program \"$INSTDIR\ScenePlus+.exe\" -Action Allow -Profile Any -ErrorAction SilentlyContinue"'
  # Clean up legacy 1.0 directory (sceneplus) if it exists
  DetailPrint "Cleaning up legacy 1.0 AppData..."
  SetShellVarContext current
  RMDir /r "$APPDATA\sceneplus"
  SetShellVarContext all
!macroend

!macro customUnInstall
  # Clean up the firewall rule during uninstallation
  DetailPrint "Cleaning up Windows Firewall (PowerShell)..."
  ExecWait 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Remove-NetFirewallRule -DisplayName \"ScenePlus+\" -ErrorAction SilentlyContinue"'

  # Prompt user to delete user data in AppData Roaming
  MessageBox MB_YESNO|MB_ICONQUESTION "ScenePlus+ のエフェクトデータおよび設定ファイル（AppData\Roaming\sceneplus）も完全に削除しますか？" IDNO skip_appdata
    DetailPrint "Removing AppData Roaming directories..."
    # Switch shell context to current user profile (C:\Users\<username>\AppData\Roaming)
    SetShellVarContext current
    RMDir /r "$APPDATA\sceneplus"
    RMDir /r "$APPDATA\ScenePlus+"
    SetShellVarContext all
  skip_appdata:
!macroend
