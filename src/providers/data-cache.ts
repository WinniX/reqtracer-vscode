import * as vscode from "vscode";
import { loadRequirements, loadMappings } from "../core/index.js";
import type { RequirementsFile, MappingsFile, TraceLink, Requirement } from "../core/index.js";

export class DataCache {
  private static instance: DataCache | null = null;

  private requirements: RequirementsFile | null = null;
  private mappings: MappingsFile | null = null;
  private projectRoot: string | null = null;
  private readonly _onDataChanged = new vscode.EventEmitter<void>();
  public readonly onDataChanged = this._onDataChanged.event;

  private constructor() {}

  static getInstance(): DataCache {
    if (!DataCache.instance) {
      DataCache.instance = new DataCache();
    }
    return DataCache.instance;
  }

  async initialize(projectRoot: string): Promise<void> {
    this.projectRoot = projectRoot;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.projectRoot) return;
    try {
      this.requirements = await loadRequirements(this.projectRoot);
      this.mappings = await loadMappings(this.projectRoot);
      console.log(`ReqTracer DataCache: loaded ${this.requirements?.requirements.length ?? 0} requirements, ${this.mappings?.mappings.length ?? 0} mappings from "${this.projectRoot}"`);
      this._onDataChanged.fire();
    } catch (err) {
      console.error("ReqTracer: Failed to refresh data cache:", err);
    }
  }

  getRequirements(): Requirement[] {
    return this.requirements?.requirements ?? [];
  }

  getRequirementById(id: string): Requirement | undefined {
    return this.requirements?.requirements.find((r) => r.id === id);
  }

  getMappingsForRequirement(requirementId: string): TraceLink[] {
    if (!this.mappings) return [];
    return this.mappings.mappings.filter((m) => m.requirementId === requirementId);
  }

  getMappingsForFile(filePath: string): TraceLink[] {
    if (!this.mappings) return [];
    return this.mappings.mappings.filter((m) => m.target.filePath === filePath);
  }

  getRequirementIdsForFile(filePath: string): string[] {
    const mappings = this.getMappingsForFile(filePath);
    return [...new Set(mappings.map((m) => m.requirementId))];
  }

  getRequirementsForSourceFile(relativeFilePath: string): Requirement[] {
    if (!this.requirements) return [];
    return this.requirements.requirements.filter((r) => r.sourceFile === relativeFilePath);
  }

  getAllMappings(): TraceLink[] {
    return this.mappings?.mappings ?? [];
  }

  dispose(): void {
    this._onDataChanged.dispose();
    DataCache.instance = null;
  }
}
