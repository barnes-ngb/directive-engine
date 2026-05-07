/**
 * Loads `toy_facade_v1` fixture data for the 3D viewer.
 *
 * The fixture uses a simplified pose shape (`{ t: [x,y,z], q: [x,y,z,w] }`)
 * which differs from the engine's `NominalPosesDataset` schema. This loader
 * normalizes both into a single typed structure that the viewer consumes.
 *
 * The engine code in `src/core/` is intentionally not touched here — Phase 1
 * is presentation-only. Later phases that call `generateDirectives()` will
 * need to map this fixture into the engine's schema separately.
 */

import nominalJson from "../../datasets/toy_facade_v1/nominal.json";
import asBuiltJson from "../../datasets/toy_facade_v1/as_built.json";
import constraintsJson from "../../datasets/toy_facade_v1/constraints.json";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

export interface PartPose {
  t: Vec3;
  q: Quat;
}

export interface FacadePart {
  partId: string;
  nominal: PartPose;
  asBuilt?: PartPose;
  asBuiltConfidence?: number;
}

export interface FacadeFixture {
  jobId: string;
  units: "mm";
  parts: FacadePart[];
  /** Raw constraints JSON, kept opaque here — Phase 3 will consume this. */
  constraintsRaw: unknown;
}

interface RawNominalPart {
  partId: string;
  T_world_part_nominal: { t: number[]; q: number[] };
}

interface RawAsBuiltPart {
  partId: string;
  T_world_part_asBuilt: { t: number[]; q: number[] };
  confidence?: number;
}

interface RawNominalDataset {
  job: { jobId: string };
  units: string;
  parts: RawNominalPart[];
}

interface RawAsBuiltDataset {
  job: { jobId: string };
  units: string;
  parts: RawAsBuiltPart[];
}

export function loadToyFacadeFixture(): FacadeFixture {
  const nom = nominalJson as RawNominalDataset;
  const asb = asBuiltJson as RawAsBuiltDataset;

  if (nom.units !== "mm" || asb.units !== "mm") {
    throw new Error(
      `toy_facade_v1 fixture must be in mm; got nominal=${nom.units}, asBuilt=${asb.units}`,
    );
  }

  const asBuiltById = new Map<string, RawAsBuiltPart>();
  for (const p of asb.parts) asBuiltById.set(p.partId, p);

  const parts: FacadePart[] = nom.parts.map((p) => {
    const ab = asBuiltById.get(p.partId);
    return {
      partId: p.partId,
      nominal: {
        t: toVec3(p.T_world_part_nominal.t, `${p.partId}.nominal.t`),
        q: toQuat(p.T_world_part_nominal.q, `${p.partId}.nominal.q`),
      },
      asBuilt: ab
        ? {
            t: toVec3(ab.T_world_part_asBuilt.t, `${p.partId}.asBuilt.t`),
            q: toQuat(ab.T_world_part_asBuilt.q, `${p.partId}.asBuilt.q`),
          }
        : undefined,
      asBuiltConfidence: ab?.confidence,
    };
  });

  return {
    jobId: nom.job.jobId,
    units: "mm",
    parts,
    constraintsRaw: constraintsJson,
  };
}

function toVec3(arr: number[], context: string): Vec3 {
  if (arr.length !== 3) {
    throw new Error(`Expected 3-element vector at ${context}, got length ${arr.length}`);
  }
  return [arr[0], arr[1], arr[2]];
}

function toQuat(arr: number[], context: string): Quat {
  if (arr.length !== 4) {
    throw new Error(`Expected 4-element quaternion at ${context}, got length ${arr.length}`);
  }
  return [arr[0], arr[1], arr[2], arr[3]];
}
