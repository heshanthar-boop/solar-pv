param(
  [Parameter(Mandatory=$true)][string]$JavaHome,
  [Parameter(Mandatory=$true)][string]$AndroidJar,
  [Parameter(Mandatory=$true)][string]$BuildTools
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'artifacts/android-build'
$assets = Join-Path $output 'assets/web'
New-Item -Force -ItemType Directory $assets, "$output/classes", "$output/dex" | Out-Null
foreach($name in @('css','js','data','icons','optimizer')) { Copy-Item -Recurse -Force (Join-Path $root $name) $assets }
Copy-Item -Force (Join-Path $root 'index.html'),(Join-Path $root 'manifest.json'),(Join-Path $root 'sw.js') $assets
# Google OAuth does not support the embedded WebView flow. Keep this test build honest.
$html = [System.IO.File]::ReadAllText("$assets/index.html")
$html = $html.Replace('</head>', '<style>#fb-signin-btn{display:none!important}</style></head>')
[System.IO.File]::WriteAllText("$assets/index.html", $html, (New-Object System.Text.UTF8Encoding($false)))
$java = Join-Path $JavaHome 'bin/java.exe'
$javac = Join-Path $JavaHome 'bin/javac.exe'
$jar = Join-Path $JavaHome 'bin/jar.exe'
$keytool = Join-Path $JavaHome 'bin/keytool.exe'
$env:JAVA_HOME = $JavaHome
$env:PATH = (Join-Path $JavaHome 'bin') + ';' + $env:PATH
function Check { if($LASTEXITCODE -ne 0) { throw "Android build failed (exit $LASTEXITCODE)" } }
& "$BuildTools/aapt.exe" package -f -M "$PSScriptRoot/AndroidManifest.xml" -S "$PSScriptRoot/res" -A "$output/assets" -I $AndroidJar --min-sdk-version 23 --target-sdk-version 32 -F "$output/unsigned.apk"
Check
& $javac -source 8 -target 8 -bootclasspath $AndroidJar -d "$output/classes" "$PSScriptRoot/src/lk/heshan/solarpv/MainActivity.java"
Check
& $jar cf "$output/classes.jar" -C "$output/classes" .
Check
& "$BuildTools/d8.bat" --min-api 23 --lib $AndroidJar --output "$output/dex" "$output/classes.jar"
Check
Push-Location "$output/dex"
try { & "$BuildTools/aapt.exe" add "$output/unsigned.apk" classes.dex; Check } finally { Pop-Location }
& "$BuildTools/zipalign.exe" -f 4 "$output/unsigned.apk" "$output/aligned.apk"
Check
$key = Join-Path $root 'artifacts/android-debug.keystore'
if (!(Test-Path $key)) {
  & $keytool -genkeypair -keystore $key -storepass android -keypass android -alias solarpv-debug -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=SolarPV Test Build,O=Heshan Engineering Solution,C=LK'
  Check
}
$apk = Join-Path $root 'artifacts/SolarPV-Android-test.apk'
& "$BuildTools/apksigner.bat" sign --ks $key --ks-key-alias solarpv-debug --ks-pass pass:android --key-pass pass:android --out $apk "$output/aligned.apk"
Check
& "$BuildTools/apksigner.bat" verify --verbose $apk
Check
Write-Host "Built $apk"
