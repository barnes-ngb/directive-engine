# Demo Video Capture Checklist

Breadcrumbs for recording the directive-engine demo video. This file exists so a single take session has everything in one place; no hunting through other docs.

> **Status:** Track A is complete; the locked narrative is the 5-beat walkthrough in `docs/demo-script.md`. The sequence below mirrors that doc — if the two diverge, `demo-script.md` is canonical.

---

## What to demonstrate

Open `/` (production build or vercel deploy) and walk the 5 beats in order. Target ~75s total, ~15s per beat. Let camera moves breathe; don't rush.

### Beat 1 — Detection (~12–15s)
1. Land on the wide 3/4 view with all panels at their as-built poses.
2. Allow ~2s of stillness so the tinted (yellow/red) panels and deviation arrows are legible.
3. Hover briefly near the worst panel to draw the eye (no click yet).
4. Click *Continue* in the beat-nav pill.

### Beat 2 — Constraint (~15s)
1. Camera dollies in on the focused panel; non-focused panels dim.
2. Wait for the DOF ghost geometry to render — translucent joint sphere, slot capsule, hatched forbidden volumes.
3. Let the subhead "Every part has constraints" read fully on screen.
4. Click *Continue*.

### Beat 3 — Directive (~15s)
1. `directive-card` overlay slides in bottom-left with the installer-language directive ("Pivot +0.4° about J1… Translate +3.2mm along S2.").
2. Hold long enough for a viewer to read the card and notice the `pending` chip + tolerance band.
3. Click *Apply* (the card button, not the beat-nav).

### Beat 4 — Apply (~12s)
1. Watch the focused panel animate from as-built to corrected pose.
2. Tints clear, deviation arrows shrink to ~0.
3. Status chip flips `pending → ok`.
4. Click *Continue*.

### Beat 5 — Verify (~15s)
1. Camera returns to the wide shot; all panels in corrected pose.
2. `verification-panel` bottom-right shows the two `metric-card`s — Before and After — with a `pass` chip on the after-metric.
3. Let the closing callout read: *"This demo runs the v0.1 contract on `toy_facade_v1`…"*
4. Hold ~1.5s of stillness on the final frame for a clean cut-to-poster.

### Things to avoid mid-take
- Don't open the Text-summary dialog (that's an accessibility surface, not a narrative beat).
- Don't click *Restart* while recording — that re-emits a state change and creates an awkward snap.
- Don't navigate with *Back* during a take; if a beat misfires, restart the take.

---

## Spec

| | |
|---|---|
| Length | 60–90 seconds. Aim for 75s. |
| Resolution | 1920×1080 minimum; 2560×1440 preferred for portfolio embedding |
| Format | MP4 (H.264) primary; WebM (VP9) optional fallback |
| Frame rate | 30fps |
| Audio | None. **No voiceover** — visuals + on-screen text narrate. Voiceover dates fast and is hard to revise. |
| Pacing | ~12–18s per beat once a beat structure is locked |

---

## Run command

Use the production build, not the dev server (the dev server has HMR overlays and slower first paint):

```powershell
npm install
npm run build
npm run preview
```

Or use the deployed Vercel URL: `https://directive-engine.vercel.app`

Production build is preferred — it's what the portfolio links to, so the video should match.

---

## Browser setup

- **Browser:** Chrome or Edge (best codec support for the screencast tool)
- **Window:** full-screen (`F11`), or borderless window sized to capture region
- **Hide chrome:**
  - Bookmarks bar off (`Ctrl+Shift+B`)
  - Extensions hidden
  - DevTools closed
- **Zoom:** 100% (`Ctrl+0`)
- **Theme:** match whatever the site uses by default; don't force dark/light unless the demo design assumes one
- **Cursor:** consider a cursor-highlight tool (e.g. Mouseposé equivalent on Windows) so click targets read on small embeds
- **Notifications:** disable system notifications, Slack, email, calendar reminders for the duration

---

## Capture tool

Pick whichever is fastest for the user. All three produce acceptable output:

| Tool | OS | Notes |
|---|---|---|
| OBS Studio | Win/Mac/Linux | Most control; set scene to "Display Capture" or "Window Capture", 1080p60, MP4 output |
| Windows Game Bar | Win | `Win+G`. Simplest; lower control over bitrate |
| ShareX | Win | Lightweight; good for quick takes |

OBS recommended for the final take because it allows a fixed 1920×1080 capture region irrespective of monitor resolution.

---

## Take procedure

1. Close everything except the browser tab with the demo
2. Open the demo and reset to its starting state (clear any deep-link query params, refresh once, let initial render settle)
3. Start the recorder
4. Wait ~1 second of stillness before the first action (gives a clean cut point)
5. Walk through the locked sequence at the planned pacing
6. End with ~1 second of stillness on the final frame (gives a clean fade-to-poster cut)
7. Stop the recorder
8. Re-record at least 2–3 takes; pick the cleanest

**Common reasons to redo a take:**
- Mouse jitter or accidental hover
- Network hitch causing a frame drop
- Notification badge appears
- Pacing too fast for the on-screen text to read

---

## Output assets

These live in the **systemsforge.build site repo**, not in this repo. Final paths (subject to that repo's static asset convention):

| Asset | Path | Purpose |
|---|---|---|
| Primary video | `site/static/video/directive-engine-demo.mp4` | Embedded on case study + demo page |
| Fallback | `site/static/video/directive-engine-demo.webm` | Optional, for browsers that prefer it |
| Poster | `site/static/img/directive-engine-poster.jpg` | Frame shown before play; pick a clean still from a mid-beat |

Poster image: export a single frame from the chosen take using ffmpeg or the recorder's frame export. 1920×1080 JPG, ~85% quality.

```bash
ffmpeg -i directive-engine-demo.mp4 -ss 00:00:25 -vframes 1 -q:v 2 directive-engine-poster.jpg
```

---

## Where the video gets embedded

When the user adds the video, these are the files that need the embed/link added. None should be edited until Track A direction is locked — but listing them here so nothing's missed later:

- `site/content/work/directive-engine.md` (site repo) — embed near top of case study
- `site/content/demo.md` or equivalent (site repo) — embed or link
- `README.md` (this repo) — link only, don't embed in markdown
- LinkedIn / outreach posts — user handles separately

---

## Compression

If the raw MP4 from OBS is large (>20 MB for 75s), re-encode for web:

```bash
ffmpeg -i raw.mp4 -c:v libx264 -crf 23 -preset slow -c:a copy directive-engine-demo.mp4
```

Target: under 15 MB for 75s at 1080p. Bump `-crf` to 26 if still too large.

For the WebM fallback:

```bash
ffmpeg -i directive-engine-demo.mp4 -c:v libvpx-vp9 -crf 32 -b:v 0 -c:a libopus directive-engine-demo.webm
```

---

## Hosting

Self-host in the site repo's static assets (not YouTube/Vimeo) for portfolio reasons: no third-party branding, no recommendation rail, full control over poster + autoplay behavior. File-size budget above keeps this practical.

If file size becomes an issue later, revisit hosting.
