# Start Here

You can treat this like a 2–3 day sprint to get to “shareable demo”.

## Day 0 (1–2 hours)
- [ ] Replace placeholders in site content (`site/content/home.md`, `site/content/work/directive-engine.md`)
- [ ] Push repo to GitHub
- [ ] Deploy the site (any stack) so you have a stable link

## Day 1 (engine loop)
- [ ] Load toy dataset (`datasets/toy_facade_v1/*`)
- [ ] Hardcode or load nominal transforms (`nominal.json`)
- [ ] Compute correction:
      `T_correction = inverse(T_asBuilt) * T_nominal`
- [ ] Project correction onto allowed DOF + quantize indexed rotations
- [ ] Emit directives JSON in `schemas/directives.schema.json` format

## Day 2 (viewer loop)
- [ ] Build minimal 3D viewer (axes + proxy geometry is fine)
- [ ] Part list → directive card UI
- [ ] “Apply” button (simulated) + show before/after metric
- [ ] Record 60–90s screen video and link it from:
    - repo README
    - `/work/directive-engine` page

## Outreach trigger
Once the website page exists and the video is recorded: you can start outreach.
