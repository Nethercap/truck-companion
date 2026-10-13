# Truck Dash for Android (Google Play)

The Android app is a **Trusted Web Activity**: it opens
`https://trucksim-dash.com/app/` full screen in the phone's Chrome, with the
app's own icon, splash screen and shortcuts (dashboard, my stats, live map,
classic gauges). There is no separate app code to maintain: every change to
the website reaches the app at once, and the Play listing only needs a new
version when this folder changes.

- `app/` is a plain Gradle project around Google's
  [androidbrowserhelper](https://github.com/GoogleChrome/android-browser-helper).
- `make_icons.py` rebuilds the launcher icons and the splash image from
  `docs/assets/press/logo-1024.png`.
- The AAB is built by the **Build Android** workflow (`.github/workflows/build-android.yml`).
- `tools/assetlinks.py` writes `docs/.well-known/assetlinks.json`, which tells
  Android that the app belongs to the site (without it the app shows Chrome's
  address bar).

Package name: `com.trucksimdash.app` (it can never change once published).

## Publishing it (maintainer)

1. **Play Console account** (one-time USD 25): <https://play.google.com/console/signup>.
   A personal account created after November 2023 has to run a **closed test
   with at least 12 testers for 14 days** before it can publish to
   production. The Discord is the natural place to find them.
2. **Upload key**, on your PC (needs a JDK, for example the one in Android
   Studio). Choose your own passwords; they never go in the repo:

   ```
   keytool -genkeypair -v -keystore truckdash-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Keep the `.jks` and its passwords somewhere safe: losing them means asking
   Google for a key reset.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   `ANDROID_KEYSTORE_BASE64` (the file in base64, for example with
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("truckdash-upload.jks"))`
   in PowerShell), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`)
   and `ANDROID_KEY_PASSWORD`.
4. **Build**: Actions → Build Android → Run workflow. Download the
   `TruckDash-android-N` artifact: it contains `app-release.aab`.
5. **Create the app** in Play Console ("Truck Dash", app, free) and upload the
   AAB to the closed testing track. Play App Signing is on by default: Play
   keeps the signing key and you upload with yours.
6. **Asset links**: in Play Console, Test and release → App integrity → App
   signing, copy the SHA-256 of the *app signing key* (and of the upload key,
   to test AABs from Actions directly). Then
   `python tools/assetlinks.py <sha256 of the signing key> <sha256 of the upload key>`,
   commit and push. Check <https://trucksim-dash.com/.well-known/assetlinks.json>
   and Google's tester:
   <https://developers.google.com/digital-asset-links/tools/generator>.
7. **Store listing, Data safety and content rating**: texts, answers and
   graphics are in the workshop (`marketing/play/`). Privacy policy:
   <https://trucksim-dash.com/privacy.html>; account deletion:
   <https://trucksim-dash.com/privacy.html#delete-account>.

Inside the app the site hides its donation links (`.twa [data-donate]`, set
by a small script in each page's `<head>` when the page is opened from the
app): Play's payments policy does not allow sending users to pay outside
Google Play. Anything new that asks for money gets `data-donate` too.

Updating: change something here, run the workflow, upload the new AAB. The
version code goes up by itself with each run.
