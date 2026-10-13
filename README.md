# FBITI SYS – Desktop & Mobile App

One code base, three ways to use it:

| Where | How |
|---|---|
| **Phone / tablet / any computer** | Install as a PWA (below) – no app store needed |
| **Windows / Mac / Linux program** | Electron wrapper in `desktop/` → `FBITI SYS Setup.exe` |
| **Android APK / Play Store** | Wrap the hosted PWA with PWABuilder (below) |

## 1. Backend (once)
1. Google Sheet → Extensions → Apps Script → paste `Code.gs`.
2. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
3. Paste the Web app URL into `API_URL` in `js/config.js`.

## 2. Host the app (needed for phone install)
Phones only install PWAs from an HTTPS address. Free options:
- **Netlify Drop** – go to app.netlify.com/drop and drag the `fbiti-system` folder (without `desktop/` and `Code.gs` is fine, they are harmless).
- **GitHub Pages** – push the folder to a repo → Settings → Pages.
- **Cloudflare Pages / Firebase Hosting** also work.

Test locally first with the VS Code **Live Server** extension (http://127.0.0.1:5500).

## 3. Install the PWA
- **Android (Chrome):** open the site → tap **⬇ Install App** in the top bar (or ⋮ → Install app).
- **iPhone/iPad (Safari):** Share → **Add to Home Screen**.
- **Windows/Mac (Chrome/Edge):** click **⬇ Install App** or the install icon in the address bar.
The app opens in its own window, works offline for drafts, and syncs when the internet returns.

## 4. Desktop program (.exe)
Needs Node.js (nodejs.org).
```
cd desktop
npm install
npm start            # test it
npm run build:win    # creates installer in desktop/dist/
```
(`build:mac` on a Mac, `build:linux` on Linux.)

## 5. Android APK
1. Host the app (step 2).
2. Go to **pwabuilder.com**, enter your site URL, choose **Android** → Download package.
3. Follow its steps to sign and install the APK (or upload to Google Play).

## 6. Your logo
- Put your logo at `assets/logo.png` (used inside the app and printouts).
- Replace the app icons in `assets/` with your logo, same names and sizes:
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (logo with extra padding), `apple-touch-icon.png` (180×180), `favicon.png`.

## 7. Updating
After editing files, change `VERSION` in `sw.js` (e.g. `fbiti-sys-v2`) so installed apps pick up the new files.

## What's new (v2)
- **Acceptance letters:** ✉ icon on every student row; tick students (or none = all shown) and press **Acceptance Letters** to print/save many at once.
- **Fees:** the Student ID box already has `FBITI-` – type only `001`, `002` …
- **Phone numbers:** digits only, auto-dashed (nine digits). To change the pattern edit `PHONE_GROUPS` in `js/config.js`.
- **Save as Picture / PDF:** rendered off-screen at a fixed width so the installed app, phone and desktop all give the same design.
- **Watermark** (logo + institution name) on every page, table, letter and printout. **JESUS IS COMING AGAIN** banner on every page.
- **Home:** icons, live figures, about text (edit `ABOUT` in `js/config.js`), programme cards, quick actions.
- **Reports by Academic Year** for students, fees and expenditure. Expenditure now has an Academic Year field.

## Updating an existing install
1. Replace all files, **paste the new `Code.gs`** into Apps Script and deploy a **new version** (Deploy → Manage deployments → Edit → New version).
   The `AcademicYear` column is added to the EXPENDITURE sheet automatically.
2. Installed apps update on next open (service worker is now `fbiti-sys-v2`). If an old look persists, close and reopen the app once.
