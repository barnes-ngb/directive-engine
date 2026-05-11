/**
 * Internal helper for gen-toy-facade-expected.mjs.
 *
 * Loads the toy_facade_v1 fixture using the viewer's loader + engine-bridge,
 * runs generateDirectives, and prints the JSON output on stdout so the
 * parent .mjs script can serialize it into the dataset directory.
 */

import { loadToyFacadeFixture } from "../src/viewer/load-fixture.js";
import { buildEngineBundle } from "../src/viewer/engine-bridge.js";

const fixture = loadToyFacadeFixture();
const bundle = buildEngineBundle(fixture);
process.stdout.write(JSON.stringify(bundle.output));
