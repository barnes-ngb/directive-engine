/**
 * Tests for the export module
 */

import { describe, it, expect } from "vitest";
import {
  generateRunSummaryMd,
  generateDirectivesCsv,
  type ExportContext
} from "./export.js";
import type { DirectivesOutput } from "../src/types.js";
import type { SimulationResult } from "../src/core/index.js";

// Mock directives output for testing
const mockDirectives: DirectivesOutput = {
  schema_version: "v0.1",
  dataset_id: "test-dataset",
  engine_version: "1.0.0",
  generated_at: "2024-01-15T10:00:00Z",
  inputs: {
    nominal_poses: "nominal.json",
    as_built_poses: "asbuilt.json",
    constraints: "constraints.json",
    confidence_threshold: 0.8
  },
  summary: {
    counts_by_status: {
      ok: 2,
      pending: 1,
      clamped: 0,
      blocked: 0,
      needs_review: 0
    }
  },
  steps: [
    {
      step_id: "step-1",
      part_id: "part-001",
      status: "ok",
      reason_codes: [],
      pose_confidence: 0.95,
      computed_errors: {
        translation_error_mm_vec: [0.1, 0.2, 0.3],
        translation_error_norm_mm: 0.374,
        rotation_error_deg: 0.5
      },
      actions: [{ action_id: "a1", type: "noop", description: "No action needed" }],
      verification: []
    },
    {
      step_id: "step-2",
      part_id: "part-002",
      status: "pending",
      reason_codes: [],
      pose_confidence: 0.9,
      computed_errors: {
        translation_error_mm_vec: [1.5, 2.0, 0.5],
        translation_error_norm_mm: 2.55,
        rotation_error_deg: 1.2
      },
      actions: [{ action_id: "a2", type: "translate", description: "Move part" }],
      verification: []
    },
    {
      step_id: "step-3",
      part_id: "part-003",
      status: "ok",
      reason_codes: [],
      pose_confidence: 0.92,
      computed_errors: {
        translation_error_mm_vec: [0.05, 0.1, 0.08],
        translation_error_norm_mm: 0.137,
        rotation_error_deg: 0.3
      },
      actions: [{ action_id: "a3", type: "noop", description: "No action needed" }],
      verification: []
    }
  ]
};

const mockConstraints = {
  parts: [
    { part_id: "part-001", tolerances: { translation_mm: 1.0, rotation_deg: 1.0 } },
    { part_id: "part-002", tolerances: { translation_mm: 1.0, rotation_deg: 1.0 } },
    { part_id: "part-003", tolerances: { translation_mm: 1.0, rotation_deg: 1.0 } }
  ]
};

describe("generateRunSummaryMd", () => {
  it("generates markdown with dataset info", () => {
    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: new Map(),
      constraints: mockConstraints
    };

    const md = generateRunSummaryMd(context);

    expect(md).toContain("# Directive Engine Run Summary");
    expect(md).toContain("**Dataset ID:** test-dataset");
    expect(md).toContain("**Engine Version:** 1.0.0");
  });

  it("includes counts by status", () => {
    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: new Map(),
      constraints: mockConstraints
    };

    const md = generateRunSummaryMd(context);

    expect(md).toContain("## Counts by Status");
    expect(md).toContain("| ok | 2 |");
    expect(md).toContain("| pending | 1 |");
  });

  it("includes top 5 largest move norms", () => {
    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: new Map(),
      constraints: mockConstraints
    };

    const md = generateRunSummaryMd(context);

    expect(md).toContain("## Top 5 Largest Move Norms");
    expect(md).toContain("| part-002 |"); // highest norm
    expect(md).toContain("| part-001 |");
    expect(md).toContain("| part-003 |");
  });

  it("includes alignment info when provided", () => {
    const context: ExportContext = {
      directives: mockDirectives,
      alignment: {
        rms_mm: 1.25,
        residuals_mm: [
          { anchor_id: "A1", residual_mm: 2.5 },
          { anchor_id: "A2", residual_mm: 1.8 },
          { anchor_id: "A3", residual_mm: 0.5 },
          { anchor_id: "A4", residual_mm: 0.3 }
        ]
      },
      simulationResults: new Map(),
      constraints: mockConstraints
    };

    const md = generateRunSummaryMd(context);

    expect(md).toContain("## Alignment Quality");
    expect(md).toContain("**RMS (mm):** 1.25");
    expect(md).toContain("### Top 3 Residual Anchors");
    expect(md).toContain("| A1 | 2.50 |");
    expect(md).toContain("| A2 | 1.80 |");
    expect(md).toContain("| A3 | 0.50 |");
    // A4 should not appear (only top 3)
    expect(md).not.toContain("| A4 |");
  });

  it("includes simulation rollup when available", () => {
    const simResults = new Map<string, SimulationResult>();
    simResults.set("part-001", {
      beforeError: { translation_mm_vec: [0.1, 0.2, 0.3], translation_norm_mm: 0.374, rotation_deg: 0.5 },
      directiveDelta: { translation_mm_vec: [0, 0, 0], rotation_deg: 0 },
      afterError: { translation_mm_vec: [0.1, 0.2, 0.3], translation_norm_mm: 0.374, rotation_deg: 0.5 },
      pass: true,
      canSimulate: true
    });
    simResults.set("part-002", {
      beforeError: { translation_mm_vec: [1.5, 2.0, 0.5], translation_norm_mm: 2.55, rotation_deg: 1.2 },
      directiveDelta: { translation_mm_vec: [-1.5, -2.0, -0.5], rotation_deg: 0 },
      afterError: { translation_mm_vec: [0.1, 0.1, 0.1], translation_norm_mm: 0.17, rotation_deg: 1.2 },
      pass: false,
      canSimulate: true
    });

    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: simResults,
      constraints: mockConstraints
    };

    const md = generateRunSummaryMd(context);

    expect(md).toContain("## Simulated Pass/Fail Rollup");
    expect(md).toContain("**Simulated:** 2 parts");
    expect(md).toContain("**Pass:** 1");
    expect(md).toContain("**Fail:** 1");
    expect(md).toContain("**Pass Rate:** 50.0%");
  });
});

describe("generateDirectivesCsv", () => {
  it("generates CSV with correct headers", () => {
    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: new Map(),
      constraints: mockConstraints
    };

    const csv = generateDirectivesCsv(context);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      "part_id,status,dx,dy,dz,move_norm_mm,tol_mm,rot_deg,tol_rot_deg,sim_after_norm_mm,sim_pass"
    );
  });

  it("generates correct data rows", () => {
    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: new Map(),
      constraints: mockConstraints
    };

    const csv = generateDirectivesCsv(context);
    const lines = csv.split("\n");

    // Check first data row (part-001)
    expect(lines[1]).toContain("part-001");
    expect(lines[1]).toContain("ok");
    expect(lines[1]).toContain("0.10"); // dx
    expect(lines[1]).toContain("0.20"); // dy
    expect(lines[1]).toContain("0.30"); // dz
  });

  it("includes simulation results when available", () => {
    const simResults = new Map<string, SimulationResult>();
    simResults.set("part-001", {
      beforeError: { translation_mm_vec: [0.1, 0.2, 0.3], translation_norm_mm: 0.374, rotation_deg: 0.5 },
      directiveDelta: { translation_mm_vec: [0, 0, 0], rotation_deg: 0 },
      afterError: { translation_mm_vec: [0.05, 0.08, 0.1], translation_norm_mm: 0.137, rotation_deg: 0.3 },
      pass: true,
      canSimulate: true
    });

    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: simResults,
      constraints: mockConstraints
    };

    const csv = generateDirectivesCsv(context);
    const lines = csv.split("\n");

    // First data row should have simulation results
    expect(lines[1]).toContain("0.14"); // sim_after_norm_mm (0.137 rounded)
    expect(lines[1]).toContain("true"); // sim_pass

    // Second row should have empty sim columns
    expect(lines[2]).toMatch(/,,$/); // ends with empty sim columns
  });

  it("handles parts without constraints", () => {
    const context: ExportContext = {
      directives: mockDirectives,
      simulationResults: new Map(),
      constraints: { parts: [] } // no constraints
    };

    const csv = generateDirectivesCsv(context);
    const lines = csv.split("\n");

    // Should still generate rows, tolerances will be empty
    expect(lines.length).toBe(4); // header + 3 data rows
  });

  it("escapes CSV fields with special characters", () => {
    const directivesWithSpecialChars: DirectivesOutput = {
      ...mockDirectives,
      steps: [
        {
          ...mockDirectives.steps[0],
          part_id: 'part,with"comma'
        }
      ]
    };

    const context: ExportContext = {
      directives: directivesWithSpecialChars,
      simulationResults: new Map(),
      constraints: mockConstraints
    };

    const csv = generateDirectivesCsv(context);

    // Field with comma/quote should be escaped
    expect(csv).toContain('"part,with""comma"');
  });
});
