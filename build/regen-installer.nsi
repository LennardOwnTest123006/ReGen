; ============================================================================
;  ReGen - Windows installer
;
;  Compiled with NSIS 3 (natively on any platform). Produces "ReGen Setup.exe":
;  a per-user installer that needs no administrator rights, installs the game,
;  and places a ReGen shortcut on the Desktop, in the Start Menu and in the
;  user's Downloads folder.
;
;  Build with:
;    makensis -DSRC=<dir with ReGen.exe> -DOUT=<output exe> regen-installer.nsi
; ============================================================================

Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"

!define APPNAME        "ReGen"
!define COMPANY        "ReGen Studio"
!define DESCRIPTION    "A single-player 2D action-adventure"
!define VERSION        "1.0.0"
!define VERSIONMAJOR   1
!define VERSIONMINOR   0
!define VERSIONBUILD   0
!define EXENAME        "ReGen.exe"
!define REGKEY         "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReGen"
!define DOWNLOADS_GUID "{374DE290-123F-4565-9164-39C4925E467B}"

!ifndef SRC
  !define SRC "..\dist\win-unpacked"
!endif
!ifndef OUT
  !define OUT "..\dist\ReGen Setup.exe"
!endif

Name "${APPNAME}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\ReGen"
InstallDirRegKey HKCU "Software\${COMPANY}\${APPNAME}" "InstallDir"
RequestExecutionLevel user
ShowInstDetails show
ShowUnInstDetails show

VIProductVersion "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}.0"
VIAddVersionKey "ProductName"     "${APPNAME}"
VIAddVersionKey "CompanyName"     "${COMPANY}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion"     "${VERSION}"
VIAddVersionKey "ProductVersion"  "${VERSION}"
VIAddVersionKey "LegalCopyright"  "Copyright (c) 2026 ${COMPANY}"

; ------------------------------------------------------------------ branding
!define MUI_ICON   "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "installerHeader.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEFINISHPAGE_BITMAP   "installerSidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "installerSidebar.bmp"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Install ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT  "ReGen is a single-player action-adventure: four worlds to explore, rifts to raid, mini-games to beat and skins to collect.$\r$\n$\r$\nThis will install ReGen for the current user only, so no administrator rights are needed. A shortcut is placed on your Desktop and in your Downloads folder.$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_TITLE "ReGen is installed"
!define MUI_FINISHPAGE_TEXT  "ReGen has been installed on your computer.$\r$\n$\r$\nShortcuts are waiting on your Desktop and in your Downloads folder."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Play ReGen now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "German"

; --------------------------------------------------------------- Downloads
; Resolves the real Downloads folder from the shell's known-folder registry
; entry, because a user can move it anywhere. Falls back to the default path.
Var DownloadsDir

Function ResolveDownloads
  ReadRegStr $0 HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" \
    "${DOWNLOADS_GUID}"
  ${If} $0 == ""
    ReadRegStr $0 HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" \
      "${DOWNLOADS_GUID}"
  ${EndIf}
  ${If} $0 == ""
    StrCpy $0 "$PROFILE\Downloads"
  ${EndIf}
  ExpandEnvStrings $DownloadsDir $0
FunctionEnd

Function un.ResolveDownloads
  ReadRegStr $0 HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" \
    "${DOWNLOADS_GUID}"
  ${If} $0 == ""
    StrCpy $0 "$PROFILE\Downloads"
  ${EndIf}
  ExpandEnvStrings $DownloadsDir $0
FunctionEnd

Function .onInit
  ${IfNot} ${AtLeastWin7}
    MessageBox MB_ICONSTOP "ReGen needs Windows 7 or newer."
    Abort
  ${EndIf}
FunctionEnd

; ------------------------------------------------------------------ install
Section "ReGen" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  SetOverwrite on

  ; a previous install would otherwise leave orphaned files behind
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"

  File /r "${SRC}\*.*"

  WriteRegStr HKCU "Software\${COMPANY}\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\${COMPANY}\${APPNAME}" "Version" "${VERSION}"

  ; Add/Remove Programs
  WriteRegStr   HKCU "${REGKEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${REGKEY}" "DisplayIcon"     "$INSTDIR\${EXENAME}"
  WriteRegStr   HKCU "${REGKEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKCU "${REGKEY}" "Publisher"       "${COMPANY}"
  WriteRegStr   HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall ReGen.exe"'
  WriteRegStr   HKCU "${REGKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall ReGen.exe" /S'
  WriteRegStr   HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${REGKEY}" "Comments"        "${DESCRIPTION}"
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" "$0"

  WriteUninstaller "$INSTDIR\Uninstall ReGen.exe"

  ; ---- shortcuts ----
  CreateShortCut "$DESKTOP\ReGen.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0 \
    SW_SHOWNORMAL "" "Play ReGen"

  CreateDirectory "$SMPROGRAMS\ReGen"
  CreateShortCut "$SMPROGRAMS\ReGen\ReGen.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0 \
    SW_SHOWNORMAL "" "Play ReGen"
  CreateShortCut "$SMPROGRAMS\ReGen\Uninstall ReGen.lnk" "$INSTDIR\Uninstall ReGen.exe"

  Call ResolveDownloads
  ${If} $DownloadsDir != ""
    CreateDirectory "$DownloadsDir"
    CreateShortCut "$DownloadsDir\ReGen.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0 \
      SW_SHOWNORMAL "" "Play ReGen"
  ${EndIf}
SectionEnd

; ---------------------------------------------------------------- uninstall
Section "Uninstall"
  Delete "$DESKTOP\ReGen.lnk"
  Delete "$SMPROGRAMS\ReGen\ReGen.lnk"
  Delete "$SMPROGRAMS\ReGen\Uninstall ReGen.lnk"
  RMDir  "$SMPROGRAMS\ReGen"

  Call un.ResolveDownloads
  ${If} $DownloadsDir != ""
    Delete "$DownloadsDir\ReGen.lnk"
  ${EndIf}

  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.html"
  Delete "$INSTDIR\*.txt"
  Delete "$INSTDIR\${EXENAME}"
  Delete "$INSTDIR\Uninstall ReGen.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\${COMPANY}\${APPNAME}"
SectionEnd
