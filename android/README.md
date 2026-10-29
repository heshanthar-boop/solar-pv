# SolarPV Android test build

The Android app packages the current web workspace and opens it at a local HTTPS origin in Android WebView. The module scanner and Excel library are bundled. The scanner records site, inverter, MPPT, string, serial, operator, time and a recent GPS position/accuracy when available, and exports the whole site. Records live on this device; export them regularly. The website and Android app use separate local databases. Other third-party libraries and live data services may still need internet.

This test APK uses a new Android application ID so it can be installed alongside the earlier test app without deleting that app's data. Hosted test builds use temporary signing keys, so future test builds may require a separate installation or an uninstall; export your inventory first. A stable private release signing key is needed for future upgrades and a Play Store release.

The wrapper opens source links in the browser and supports the Android file picker. Camera and location permissions are requested when scanning. The module-inventory Excel export uses Android's document picker. Google sign-in is hidden because the existing web OAuth flow does not work in an embedded WebView. Other blob-based exports and print popups still require native integration; use the website for those features until they are implemented and verified.

Build with Windows PowerShell and an Android SDK platform jar, Android build tools and JDK 17:

```
./android/build.ps1 -JavaHome 'C:/path/to/jdk' -AndroidJar 'C:/path/to/android.jar' -BuildTools 'C:/path/to/build-tools'
```

The APK is generated at `artifacts/SolarPV-Android-test.apk`. This is a test package, not a Play Store release.
