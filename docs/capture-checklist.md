# Demo Video Capture Checklist

Breadcrumbs for recording the directive-engine demo video. This file exists so a single take session has everything in one place; no hunting through other docs.

> **Status:** This checklist is content-agnostic on purpose. It does **not** prescribe a 5-beat narrative vs. the current Runbook-mode demo — that decision belongs to the Track A copy work, which is paused. Once the demo's canonical narrative is locked, fill in "What to demonstrate" below.

---

## What to demonstrate

**TODO — populate after Track A inventory.** This section names the on-screen sequence the take should follow. Until that's locked, do not record final takes.

Candidate sources for the script once direction is set:
- `docs/01_demo_script.md` — original v0.1 sprint script (likely stale)
- The 5-beat narrative in `SESSION_HANDOFF.md` — only valid if/when the 5-beat build ships
- A new script reflecting Runbook mode + Alignment View + Museum calibration as currently shipped

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
