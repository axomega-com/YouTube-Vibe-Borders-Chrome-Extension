# Publishing checklist

`out/youtube-vibe-borders-1.0.0.zip` is the upload artifact. It is built from git-tracked
files only by `bash tools/build-zip.sh`, which refuses to emit a package that is missing the
manifest at the zip root, missing a 128px icon, carrying a `key` field, or containing the
dev API key.

## What is already done for you

| Item | State |
| --- | --- |
| `manifest.json` at zip root, MV3 | done |
| Icons 16/32/48/128 in the package and referenced by the manifest | done (`tools/make-icons.mjs` regenerates them) |
| Description within the 132-character limit | done (112 chars) |
| Listing name, short description, detailed description | `store/listing.md` |
| Permission justifications | `store/permission-justifications.md` |
| Reviewer notes | `store/reviewer-notes.md` |
| Privacy policy | `PRIVACY.md` at the repo root (public, no login needed) and `docs/privacy-policy.html` for the hosted page |
| Screenshots at exactly 1280x800 | `out/store/screenshot-*.png` |
| Permission warnings minimised | `tabs` dropped, so no "read your browsing history" prompt |
| No dev key in the package | verified by the build script on every build |

## What only you can do

1. **Pay the one-off developer registration fee** and create the publisher account at
   https://chrome.google.com/webstore/devconsole (it also requires a verified email and
   2FA on the account).
2. ~~Decide the listing name.~~ **Done:** the package ships as `Vibe Borders for YouTube`
   (`src/manifest.json`, v1.0.0). The published name is whatever the *uploaded* manifest says,
   so upload `out/youtube-vibe-borders-1.0.0.zip` or the old name comes back.
3. ~~Fill in your real details.~~ **Done:** the policy names AXOmega and
   support@axomega.com, dated 27 September 2026, with no placeholders left. It lives in
   `PRIVACY.md` at the repo root (plus `docs/privacy-policy.html` for the hosted page).
4. **Privacy policy URL.** Live, verified anonymously, no login needed:
   https://github.com/axomega-com/YouTube-Vibe-Borders-Chrome-Extension/blob/main/PRIVACY.md
   GitHub Pages is *not* enabled - creating the site needs a Settings visit or a PAT with
   `Pages: write`. Once enabled with source `main` / `docs`, the dedicated page becomes
   https://axomega-com.github.io/YouTube-Vibe-Borders-Chrome-Extension/privacy-policy.html
5. **Mint a throwaway, credit-limited OpenRouter key** for the reviewer, revoke it after
   approval, and paste it into `store/reviewer-notes.md` where it says
   `[PASTE A TEMPORARY OPENROUTER KEY HERE]`.
6. **Upload and fill the form:**
   - New item -> upload `out/youtube-vibe-borders-1.0.0.zip`
   - Store listing -> name, short description, detailed description, category
     (Productivity; Fun is the reasonable alternative), language, plus the 128x128 icon and
     the 1280x800 screenshots
   - Privacy practices -> single purpose, the four permission justifications, and the data
     usage declarations. Tick **Website content** (video titles and channel names are read
     from the page) and declare that it is transmitted to a third party, not sold, and not
     used for anything beyond the extension's single purpose.
   - Distribution -> visibility (public or unlisted) and regions
   - Notes for reviewer -> paste `store/reviewer-notes.md`
7. **Submit for review.** Expect a few days. If it is rejected, the email names the policy
   clause; the fix is usually the name, the privacy policy URL, or a missing justification.

## After publishing

- To ship a change: edit `src/`, `git commit`, bump `"version"` in `src/manifest.json` (the
  store rejects a duplicate version), then `bash tools/build-zip.sh` and upload the new zip.
- Keep `src/config.local.js` gitignored. It holds your personal dev key and must never be
  committed, or it will be published on the next build.
