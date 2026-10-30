# SolarPV Android test build

The Android app packages the current web workspace and opens it at a local HTTPS origin in Android WebView. The module scanner and Excel library are bundled. The scanner records site, inverter, MPPT, string, serial, operator, time and a recent GPS position/accuracy when available, and exports the whole site. Records live on this device; export them regularly. The website and Android app use separate local databases. Other third-party libraries and live data services may still need internet.

Ground Site Survey records GPS or map-marked boundary points, ruler endpoints and circle radius; displays preliminary area and distance; and exports/imports Excel surveys. Street/satellite map tiles require internet. GPS accuracy, elevation and map imagery do not replace a formal survey.

This camera test APK uses a new Android application ID so it can be installed alongside earlier test apps without deleting their data. Export the module workbook from the previous app and use the new scanner's Excel import to migrate it. Export and import each saved site survey separately as needed. Hosted test builds use temporary signing keys, so future test builds may require a separate installation or an uninstall; export your inventory first. A stable private release signing key is needed for future upgrades and a Play Store release.

The wrapper opens source links in the browser and supports the Android file picker. Camera and location permissions are requested when scanning. The module-inventory Excel export uses Android's document picker. Google sign-in is hidden because the existing web OAuth flow does not work in an embedded WebView. Other blob-based exports and print popups still require native integration; use the website for those features until they are implemented and verified.

Build with Windows PowerShell and an Android SDK platform jar, Android build tools and JDK 17:

```
./android/build.ps1 -JavaHome 'C:/path/to/jdk' -AndroidJar 'C:/path/to/android.jar' -BuildTools 'C:/path/to/build-tools'
```

The APK is generated at `artifacts/SolarPV-Android-test.apk`. This is a test package, not a Play Store release.

The scanner requests a higher-resolution rear-camera stream and tries continuous autofocus when the phone exposes it. Camera selection, refocus, zoom and the light are shown only when supported by the device. If a label is blurry, move farther away and avoid reflections; manual serial entry is available. These controls depend on Android WebView and camera support and must be checked on a physical phone.

## On-device Solar Yield Optimizer (test)

This build includes the corrected desktop optimizer and its Pyodide 0.29.2 runtime, so the scientific calculations run on the device without a separate calculation server. It is considerably larger than the scanner-only APK. The bundled Pyodide, pvlib, pandas, NumPy, SciPy and other dependencies include their own license metadata in their distribution files. The optimizer opens from the home screen in an embedded view.

Phone safeguards reject coarse single-plane and symmetric grids over 300 candidates and excessively large local or independent searches; they never silently claim that an unsearched grid was completed. The default phone steps are visible in the UI. Cancel stops the worker and clears any uploaded weather session. Progress is reported after computation rather than continuously. Long-term analysis is limited to five years; atlas background building and horizon shading are unavailable in this test. Uploaded data stays in worker memory until it is restarted. Clear-sky output is an idealised upper-bound comparison, not measured weather.

PVGIS data and map tiles need internet. The Android wrapper uses an allowlisted HTTPS proxy to the official PVGIS 5.3 API because that API does not allow ordinary cross-origin browser requests. The web version may not be able to fetch PVGIS directly; use a validated weather CSV or clear-sky for testing. The proxy and WebView's loading, file pickers, report exports, memory use and cancellation have not been verified on a physical Android device. Results are preliminary, and East-West geometry uses independent shed approximations as noted in the optimizer.

This test uses a separate package ID and installs alongside earlier tests. Export the module inventory and each site survey to Excel in the previous app, then import the backups into this build. Do not uninstall the old app until the records are verified. The test build's signing key is temporary; production updates need a stable private key.
