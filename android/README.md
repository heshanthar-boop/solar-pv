# SolarPV Android test build

The Android app packages the current web workspace and opens it at a local HTTPS origin in Android WebView. Calculations, local project data, and illustrations can work without a connection. Third-party libraries and live data services may still need internet. Data stored in this Android app is separate from data stored on the website.

The initial APK is signed with a locally generated test key. Keep `artifacts/android-debug.keystore` safe: updates to this installation need the same signing key. The debug key is not appropriate for a Play Store release.

This initial wrapper opens source links in the browser and supports the Android file picker. Google sign-in is hidden because the existing web OAuth flow does not work in an embedded WebView. Blob-based exports and print popups require additional native integration; use the website for those features until they are implemented and verified. Location-based functions may need a future Android permission flow.

Build with Windows PowerShell and an Android SDK platform jar, Android build tools and JDK 17:

```
./android/build.ps1 -JavaHome 'C:/path/to/jdk' -AndroidJar 'C:/path/to/android.jar' -BuildTools 'C:/path/to/build-tools'
```

The APK is generated at `artifacts/SolarPV-Android-test.apk`. This is a test package, not a Play Store release.
