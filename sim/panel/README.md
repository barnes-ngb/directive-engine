# sim/panel

Directive Engine as a page you can take apart. One facade panel (P-05 of `toy_facade_v1`) on its anchors; three
sliders set its as-built deviation; `generateDirectives()` runs on every change; the directive card, the residual
readout and the verdict print what the engine returned; APPLY moves the panel along the directive. Explode, isolate,
glass, callouts, four camera views, and a five-beat auto tour that hands control over on the first click.

Built with the [teardown](https://github.com/elvarofficial/teardown) kit (MIT). The kit is the renderer and the
page conventions; every number on the page comes from this repo's engine.

| File | Job |
|---|---|
| `kin.js` | No math. Wraps the engine: `solve(dev)` builds a fixture with P-05 at nominal + dev and reads the Step back. `heroPose(sol, k)` is the panel's pose at apply fraction k. |
| `panel.js` | The facade in three.js: wall, nine panels, the hero as parts (slab, J1 hinge, S2 slot bracket, P3 bolt pattern), anchors, the nominal outline. |
| `stage.js` | Studio, lights, shadows. `frame(state, cam)` draws one frame. |
| `console.js` | The 1600 × 900 overlay. `update(s)` prints the frame's state; it computes nothing. |
| `live.js` | Input, camera, tour, idle handover. |
| `check_kin.mjs` | The instrument for the math layer: a deviation ladder against `expected_directives.json`. |

## Build (PowerShell)

Install the kit once, anywhere:

```powershell
git clone https://github.com/elvarofficial/teardown $HOME\teardown
cd $HOME\teardown
npm install
npx playwright install chromium   # only needed for the film and stills
```

Then from this repo's root:

```powershell
npx tsx sim\panel\check_kin.mjs                      # the math layer, should print "matches ... true"
node $HOME\teardown\sims\build.mjs .\sim\panel         # -> .\teardown-out\dist\panel.html
Start-Process .\teardown-out\dist\panel.html
```

The page is one offline HTML file. To publish it with the demo, copy it to `demo/public/panel.html` and it deploys
at `/panel.html` alongside the viewer.

## Review loop

The kit's rule applies: nothing is done until frames have been read. From this repo's root, with the page built:

```powershell
node $HOME\teardown\sims\capture.mjs .\sim\panel --size 1600x900 --dpr 1.2 --still 2 --out .\teardown-out\panel-2.png
```

Look for: callout leaders landing on J1 (right edge), S2 (centre, behind), P3 (centre, behind, lower); the nominal
outline visible behind the hero when it is off; the residual dot moving from red to green on APPLY; `blocked` at
11 mm leaving the panel where it is.

## Limits

- Pose recovery is not in the loop; the deviation is set by hand, as in the viewer.
- Only P-05 is driven. The other eight keep the fixture's scan noise and never move.
- No film or score yet; the live page is the deliverable. The kit's `film.js` pattern is the next step.
