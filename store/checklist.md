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
| Privacy policy | `store/privacy-policy.md`, published at `docs/privacy-policy.html` via GitHub Pages |
| Screenshots at exactly 1280x800 | `out/store/screenshot-*.png` |
| Permission warnings minimised | `tabs` dropped, so no "read your browsing history" prompt |
| No dev key in the package | verified by the build script on every build |

## What only you can do

1. **Pay the one-off developer registration fee** and create the publisher account at
   https://chrome.google.com/webstore/devconsole (it also requires a verified email and
   2FA on the account).
2. **Decide the listing name.** See the note in `store/listing.md`: leading with a Google
   trademark is the usual reason a listing is flagged for implying affiliation, and the name
   is locked once published. If you want `Vibe Borders for YouTube`, change `"name"` in
   `src/manifest.json` now, then rebuild.
3. **Fill in your real details** in `store/privacy-policy.md` / `.html` - every `[DATE]`,
   `[YOUR NAME OR COMPANY]` and `[YOUR CONTACT EMAIL]` placeholder.
4. **Host the privacy policy** at a public URL (GitHub Pages, Cloudflare Pages, or a Gist
   rendered through a service like htmlpreview). The dashboard requires the URL and will not
   accept the listing without it.
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
