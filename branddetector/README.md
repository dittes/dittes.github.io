# Brand Identity Detector

A production-oriented static HTML/CSS/JavaScript web app for inspecting the brand identity of websites as honestly as a browser-only tool can.

## What it does

The app provides three clearly separated analysis modes:

1. **Analyze This Page**
   - Best mode.
   - Uses a bookmarklet that runs inside the target page context.
   - Can inspect live DOM, computed styles, visible elements, CSS variables, fonts, logos, and repeated UI colors.
   - Sends results back to the app with `postMessage`.

2. **Analyze URL**
   - Best-effort only.
   - Tries to `fetch()` the URL and parse what is accessible.
   - Extracts metadata such as favicon, touch icons, Open Graph image, theme color, schema.org logo, manifest icons, and any readable inline/CSS hints.
   - Clearly reports blocked steps caused by CORS or unreadable stylesheets.

3. **Screenshot / Assets**
   - Works fully locally in the browser.
   - Extracts a color palette from uploaded screenshots or logo assets.
   - Suggests likely neutral/background/accent colors.
   - Includes a manual crop tool for selecting a logo region.
   - Generates exportable brand tokens.

## Static constraints and honesty

This app does **not** pretend that a static site can fully inspect arbitrary third-party websites.

It explicitly reports limitations caused by:
- CORS
- iframe restrictions
- cross-origin stylesheet access rules
- tainted canvas restrictions
- CSP that may block script injection on some websites
- inability to inspect arbitrary cross-origin DOM from a separate static page

## Dependencies

No heavy dependencies are required.

The app uses:
- plain HTML
- plain CSS
- vanilla JavaScript modules
- native browser APIs only

No framework. No backend. No Node.js runtime required in production.

## File structure

- `index.html`
- `assets/css/styles.css`
- `assets/js/app.js`
- `assets/js/state.js`
- `assets/js/ui.js`
- `assets/js/modes/current-page.js`
- `assets/js/modes/current-page-runner.js`
- `assets/js/modes/url-analysis.js`
- `assets/js/modes/image-analysis.js`
- `assets/js/detectors/logo-detector.js`
- `assets/js/detectors/font-detector.js`
- `assets/js/detectors/color-detector.js`
- `assets/js/detectors/brand-signals.js`
- `assets/js/utils/color.js`
- `assets/js/utils/dom.js`
- `assets/js/utils/export.js`
- `assets/js/utils/score.js`

## Local testing

Because the app uses ES modules and fetches local assets, test it from static hosting or a simple local server, for example:

```bash
cd brand-identity-detector
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

## Notes on testing each mode

### Analyze This Page
1. Open the app from a static URL.
2. Go to the “Analyze This Page” tab.
3. Drag the generated bookmarklet to your bookmarks bar.
4. Visit a target website.
5. Click the bookmarklet.
6. The bookmarklet opens the app in a new tab and posts the result back.

Some sites may block injected scripts with CSP. The app will explain that limitation.

### Analyze URL
1. Paste a URL.
2. The app attempts a direct browser fetch.
3. If blocked by CORS, you will see that explicitly.

### Screenshot / Assets
1. Upload a homepage screenshot or a logo file.
2. Review extracted palette.
3. Adjust the crop box if you want a logo region.
4. Export CSS variables, JSON, or design tokens.

## Known limitations

- URL mode cannot guarantee HTML access for arbitrary domains.
- Cross-origin stylesheets are often unreadable.
- Screenshot mode cannot identify exact fonts reliably.
- Automatic logo inference from a screenshot is heuristic only.
- Current-page mode depends on the target site allowing bookmarklet script execution.

