; Script generated by the Inno Setup Script Wizard.
; SEE THE DOCUMENTATION FOR DETAILS ON CREATING INNO SETUP SCRIPT FILES!

#define OdooAppName "Odoo"
#define OdooVersion "16.0"
#define OdooPublisher "Odoo S.A."
#define OdooURL "https://odoo.com"
#define OdooExeName "python.exe"
#define ToolsDir "c:\odoobuild"
#define ServiceName "odoo-server-" + OdooVersion
#define PythonVersion "3.7.7"

[Setup]
; NOTE: The value of AppId uniquely identifies this application. Do not use the same AppId value in installers for other applications.
; (To generate a new GUID, click Tools | Generate GUID inside the IDE.)
AppId={{272D41D7-B341-45A7-974A-0FF22B3693CC}
AppName={#OdooAppName}
AppVersion={#OdooVersion}
AppPublisher={#OdooPublisher}
AppPublisherURL={#OdooURL}
AppSupportURL={#OdooURL}
AppUpdatesURL={#OdooURL}
DefaultDirName={autopf}\{#OdooAppName}
DisableProgramGroupPage=yes
OutputDir="{#ToolsDir}\output"
OutputBaseFilename=odoosetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Types]
Name: "normal"; Description: "Odoo Installation"
Name: "iot"; Description: "Iot Box Installation"

[Components]
Name: "normal"; Description: "Normal Odoo Installation"; Types: normal;

[Tasks]
Name: "install_postgresql"; Description: "Download and Install Postgresql Server"; GroupDescription: "Postgresql Server" ; Components: normal

[Dirs]
Name: "{app}\python"
Name: "{app}\nssm"
Name: "{app}\server"
Name: "{app}\vcredist"
Name: "{app}\thirdparty"


[Files]
Source: "{#ToolsDir}\WinPy64\python-{#PythonVersion}.amd64\*"; Excludes: "__pycache__" ; DestDir: "{app}\python"; Flags: recursesubdirs
Source: "{#ToolsDir}\nssm-2.24\*"; DestDir: "{app}\nssm"; Flags: recursesubdirs
Source: "{#ToolsDir}\server\*"; DestDir: "{app}\server"; Excludes: "wkhtmltopdf\*,enterprise\*"; Flags: recursesubdirs
Source: "{#ToolsDir}\vcredist\*.exe"; DestDir: "{app}\vcredist"

[Run]
Filename: "{app}\vcredist\vc_redist.x64.exe"; Parameters: "/q"; StatusMsg: "Installing Visual C++ redistribuable files"
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "install {#ServiceName} {app}\python\python.exe"; StatusMsg: "Installing Windows service"
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "set {#ServiceName} AppDirectory {app}\python\"; StatusMsg: "Setting up Windows service"
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "set {#ServiceName} AppParameters {app}\server\odoo-bin -c {app}\server\odoo.conf"; StatusMsg: "Setting up Windows service"
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "set {#ServiceName} ObjectName LOCALSEERVICE"
