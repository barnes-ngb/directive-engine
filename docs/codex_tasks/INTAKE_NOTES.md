# Intake Notes

## Toy dataset JSON paths (used by tests)

- Nominal poses: `datasets/toy_v0_1/toy_nominal_poses.json`
- As-built poses: `datasets/toy_v0_1/toy_asbuilt_poses.json`
- Constraints: `datasets/toy_v0_1/toy_constraints.json`
- Expected output directives: `datasets/toy_v0_1/expected_directives.json`

These paths match the fixtures referenced by the golden tests in `src/test/golden.ts`.

## Build output check

- Build command: `npm run build`
- `dist/toy_facade_v1`: `README.md`, `as_built.json`, `constraints.json`, `expected_directives.json`, `nominal.json`
- `dist/toy_v0_1`: `expected_directives.json`, `toy_asbuilt_poses.json`, `toy_constraints.json`, `toy_nominal_poses.json`
