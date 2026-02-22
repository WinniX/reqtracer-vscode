import type { RequirementsFile, MappingsFile, TraceLink, CodeLocation, TestLocation } from "../models/types.js";
import { loadRequirements } from "../requirements/requirements-store.js";
import { loadMappings } from "./mappings-store.js";

/**
 * Coverage status for a single requirement
 */
export interface RequirementCoverage {
  /** Requirement ID */
  requirementId: string;
  /** Requirement title */
  title: string;
  /** Number of code TraceLinks (type === "code") */
  codeLinks: number;
  /** Number of test TraceLinks (type === "test") */
  testLinks: number;
  /** Whether this requirement has at least one code link */
  hasCoverage: boolean;
  /** Whether this requirement has at least one test link */
  hasTests: boolean;
  /** Code locations mapped to this requirement */
  codeLocations: CodeLocation[];
  /** Test locations mapped to this requirement */
  testLocations: TestLocation[];
}

/**
 * Summary of coverage across all requirements
 */
export interface CoverageSummary {
  /** Total number of requirements */
  totalRequirements: number;
  /** Requirements with at least one code link */
  coveredCount: number;
  /** Requirements with at least one test link */
  testedCount: number;
  /** Requirements with zero code TraceLinks */
  uncoveredRequirements: string[];
  /** Requirements with zero test TraceLinks */
  untestedRequirements: string[];
  /** Coverage percentage (covered / total * 100) */
  coveragePercent: number;
  /** Test coverage percentage (tested / total * 100) */
  testCoveragePercent: number;
  /** Per-requirement coverage details */
  details: RequirementCoverage[];
}

/**
 * Derive a coverage summary from requirements and mappings data.
 * Identifies uncovered requirements (zero code TraceLinks) and
 * untested requirements (zero test TraceLinks).
 */
export function deriveCoverageSummary(
  requirements: RequirementsFile,
  mappings: MappingsFile | null,
): CoverageSummary {
  const allMappings = mappings?.mappings ?? [];

  // Group mappings by requirement ID
  const codeByReq = new Map<string, TraceLink[]>();
  const testByReq = new Map<string, TraceLink[]>();

  for (const link of allMappings) {
    if (link.type === "code") {
      if (!codeByReq.has(link.requirementId)) {
        codeByReq.set(link.requirementId, []);
      }
      codeByReq.get(link.requirementId)!.push(link);
    } else if (link.type === "test") {
      if (!testByReq.has(link.requirementId)) {
        testByReq.set(link.requirementId, []);
      }
      testByReq.get(link.requirementId)!.push(link);
    }
  }

  const details: RequirementCoverage[] = [];
  const uncoveredRequirements: string[] = [];
  const untestedRequirements: string[] = [];
  let coveredCount = 0;
  let testedCount = 0;

  for (const req of requirements.requirements) {
    const codeLinks = codeByReq.get(req.id) ?? [];
    const testLinks = testByReq.get(req.id) ?? [];
    const hasCoverage = codeLinks.length > 0;
    const hasTests = testLinks.length > 0;

    if (hasCoverage) coveredCount++;
    if (hasTests) testedCount++;
    if (!hasCoverage) uncoveredRequirements.push(req.id);
    if (!hasTests) untestedRequirements.push(req.id);

    details.push({
      requirementId: req.id,
      title: req.title,
      codeLinks: codeLinks.length,
      testLinks: testLinks.length,
      hasCoverage,
      hasTests,
      codeLocations: codeLinks.map((l) => l.target as CodeLocation),
      testLocations: testLinks.map((l) => l.target as TestLocation),
    });
  }

  const total = requirements.requirements.length;

  return {
    totalRequirements: total,
    coveredCount,
    testedCount,
    uncoveredRequirements,
    untestedRequirements,
    coveragePercent: total > 0 ? Math.round((coveredCount / total) * 10000) / 100 : 0,
    testCoveragePercent: total > 0 ? Math.round((testedCount / total) * 10000) / 100 : 0,
    details,
  };
}

/**
 * Load requirements and mappings from disk and derive coverage summary.
 * Convenience function that wraps deriveCoverageSummary with file I/O.
 *
 * @param projectRoot - Absolute path to project root
 * @returns Coverage summary, or null if no requirements.json exists
 */
export async function getCoverageSummary(projectRoot: string): Promise<CoverageSummary | null> {
  const requirements = await loadRequirements(projectRoot);
  if (!requirements) {
    return null;
  }

  const mappings = await loadMappings(projectRoot);
  return deriveCoverageSummary(requirements, mappings);
}
