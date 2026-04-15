import {
    ResolvedDeclaration,
    ResolvedInterface,
    ResolvedEnum,
    ResolvedField,
    FieldType,
    ResolutionResult,
} from "./resolver";

export interface GeneratedFile {
    filename: string;
    content: string;
}

export interface BaseGeneratorOptions {
    /** Suffix appended to generated class names (default: varies per generator) */
    classSuffix?: string;
    /** Emit a barrel index.ts re-exporting all generated files */
    emitBarrel?: boolean;
}

/**
 * Abstract base class for all NestJS code generators.
 *
 * Provides shared infrastructure:
 * - Enum generation
 * - TypeScript type string rendering
 * - Name collection/deduplication
 * - The top-level `generate()` loop with optional barrel emission
 *
 * Subclasses implement `generateInterface()` to produce their specific output
 * (e.g. Swagger DTOs, Mongoose schemas).
 */
export abstract class BaseGenerator<TOptions extends BaseGeneratorOptions> {
    protected opts: Required<TOptions>;

    constructor(opts: TOptions, defaults: Required<TOptions>) {
        this.opts = { ...defaults, ...opts } as Required<TOptions>;
    }

    // ── Public entry point ────────────────────────────────────────────────────

    generate(result: ResolutionResult): GeneratedFile[] {
        const files: GeneratedFile[] = [];
        const skipNames = new Set<string>(result.roots ? [result.root.name] : []);

        for (const decl of result.declarations) {
            if (skipNames.has(decl.name)) continue;
            files.push(
                decl.kind === "enum"
                    ? this.generateEnum(decl)
                    : this.generateInterface(decl, result)
            );
        }

        if (this.opts.emitBarrel) {
            const exports = files
                .map((f) => `export * from './${f.filename.replace(/\.ts$/, "")}';`)
                .join("\n");
            files.push({ filename: "index.ts", content: exports + "\n" });
        }

        return files;
    }

    // ── Abstract: subclasses must implement ───────────────────────────────────

    /** Generate a single interface/class file. */
    protected abstract generateInterface(
        decl: ResolvedInterface,
        result: ResolutionResult
    ): GeneratedFile;

    // ── Shared: Enum generation ───────────────────────────────────────────────

    protected generateEnum(decl: ResolvedEnum): GeneratedFile {
        const lines = [`export enum ${decl.name} {`];
        for (const m of decl.members) {
            const val = typeof m.value === "string" ? `'${m.value}'` : String(m.value);
            lines.push(`  ${m.name} = ${val},`);
        }
        lines.push(`}`);
        return { filename: `${decl.name}.ts`, content: lines.join("\n") + "\n" };
    }

    // ── Shared: Naming ────────────────────────────────────────────────────────

    /**
     * Strip a leading `I` from interface names and append the configured suffix.
     * e.g. `IUser` → `UserDto` (with suffix "Dto")
     */
    protected toClassName(name: string): string {
        const stripped = name.replace(/^I([A-Z])/, "$1");
        const suffix = this.opts.classSuffix as string;
        return stripped.endsWith(suffix) ? stripped : `${stripped}${suffix}`;
    }

    // ── Shared: TypeScript type string ────────────────────────────────────────

    protected toTsType(type: FieldType, result: ResolutionResult): string {
        switch (type.kind) {
            case "primitive": return type.type;
            case "literal":   return typeof type.value === "string" ? `'${type.value}'` : String(type.value);
            case "array": {
                const inner = this.toTsType(type.elementType, result);
                const needsParens = type.elementType.kind === "union";
                return needsParens ? `(${inner})[]` : `${inner}[]`;
            }
            case "reference": return this.toClassName(type.name);
            case "enum":      return type.name;
            case "record":    return `Record<${this.toTsType(type.keyType, result)}, ${this.toTsType(type.valueType, result)}>`;
            case "union":     return type.types.map((t) => this.toTsType(t, result)).join(" | ");
            default:          return "any";
        }
    }

    // ── Shared: name collection ───────────────────────────────────────────────

    protected collectUsedNames(type: FieldType, out: Set<string>): void {
        switch (type.kind) {
            case "reference": out.add(type.name); break;
            case "enum":      out.add(type.name); break;
            case "array":     this.collectUsedNames(type.elementType, out); break;
            case "record":
                this.collectUsedNames(type.keyType, out);
                this.collectUsedNames(type.valueType, out);
                break;
            case "union":
                for (const t of type.types) this.collectUsedNames(t, out);
                break;
        }
    }

    protected collectUnionDtoNames(type: FieldType, out: string[]): void {
        if (type.kind === "union") {
            for (const t of type.types) {
                if (t.kind === "reference") out.push(t.name);
                else this.collectUnionDtoNames(t, out);
            }
        } else if (type.kind === "array") {
            this.collectUnionDtoNames(type.elementType, out);
        }
    }

    // ── Shared: union helpers ─────────────────────────────────────────────────

    protected isAllLiterals(types: FieldType[]): boolean {
        return types.length > 0 && types.every((t) => t.kind === "literal");
    }

    protected buildLiteralEnumExpr(types: FieldType[]): string {
        const vals = types
            .map((t) => (t.kind === "literal" ? t.value : null))
            .filter((v) => v !== null);
        return `[${vals.map((v) => (typeof v === "string" ? `'${v}'` : v)).join(", ")}]`;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// ImportBuilder  (shared utility, used by all generators)
// ──────────────────────────────────────────────────────────────────────────────

export class ImportBuilder {
    private map = new Map<string, Set<string>>();

    add(module: string, name: string): void {
        if (!this.map.has(module)) this.map.set(module, new Set());
        this.map.get(module)!.add(name);
    }

    reserve(module: string): void {
        if (!this.map.has(module)) this.map.set(module, new Set());
    }

    addLocal(module: string, name: string): void {
        this.add(module, name);
    }

    render(): string {
        const lines: string[] = [];
        const external: [string, string[]][] = [];
        const local: [string, string[]][] = [];

        for (const [mod, names] of this.map.entries()) {
            const sorted = [...names].sort();
            if (sorted.length === 0) continue;
            (mod.startsWith(".") ? local : external).push([mod, sorted]);
        }

        for (const [mod, names] of external) lines.push(`import { ${names.join(", ")} } from '${mod}';`);
        if (external.length > 0 && local.length > 0) lines.push("");
        for (const [mod, names] of local) lines.push(`import { ${names.join(", ")} } from '${mod}';`);

        return lines.join("\n");
    }
}