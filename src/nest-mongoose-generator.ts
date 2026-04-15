import {
    ResolvedInterface,
    ResolvedField,
    FieldType,
    ResolutionResult,
} from "./resolver";
import { BaseGenerator, BaseGeneratorOptions, GeneratedFile, ImportBuilder } from "./base-generator";

export interface NestMongooseGeneratorOptions extends BaseGeneratorOptions {
    /**
     * When true, adds `{ timestamps: true }` to `@Schema()`.
     * @default true
     */
    timestamps?: boolean;
    /**
     * When true, generates a companion TypeScript interface (`IFoo`) in the
     * same file so callers can type lean Mongoose documents.
     * @default false
     */
    emitInterface?: boolean;
}

interface PropDescriptor {
    required?: boolean;
    type?: string;       // Mongoose type expression, e.g. `String`, `Number`, `[String]`
    enum?: string;       // enum array literal or enum identifier
    ref?: string;        // nested schema class name for { type: ..., ref: '...' }
    isArray?: boolean;
    default?: string;
}

export class NestMongooseGenerator extends BaseGenerator<NestMongooseGeneratorOptions> {
    constructor(opts: NestMongooseGeneratorOptions = {}) {
        super(opts, {
            classSuffix:    opts.classSuffix    ?? "Schema",
            emitBarrel:     opts.emitBarrel     ?? false,
            timestamps:     opts.timestamps     ?? true,
            emitInterface:  opts.emitInterface  ?? false,
        });
    }

    // ── Interface → Mongoose schema class ────────────────────────────────────

    protected generateInterface(
        decl: ResolvedInterface,
        result: ResolutionResult
    ): GeneratedFile {
        const schemaName = this.toClassName(decl.name);
        const imports = new ImportBuilder();

        imports.add("@nestjs/mongoose", "Prop");
        imports.add("@nestjs/mongoose", "Schema");
        imports.add("@nestjs/mongoose", "SchemaFactory");

        const resolvedByName = new Map(result.declarations.map((d) => [d.name, d]));

        // Local imports for all referenced types
        const usedNames = new Set<string>();
        for (const field of decl.fields) this.collectUsedNames(field.type, usedNames);
        for (const name of usedNames) {
            if (name === decl.name) continue;
            const dep = resolvedByName.get(name);
            if (!dep) continue;
            if (dep.kind === "enum") {
                imports.addLocal(`./${dep.name}`, dep.name);
            } else {
                const n = this.toClassName(dep.name);
                if (n !== schemaName) imports.addLocal(`./${n}`, n);
            }
        }

        // Field lines
        const classLines: string[] = [];
        for (const field of decl.fields) {
            classLines.push(...this.generateField(field, imports, result), "");
        }
        if (classLines[classLines.length - 1] === "") classLines.pop();

        // Schema decorator options
        const schemaOpts: string[] = [];
        if (this.opts.timestamps) schemaOpts.push("timestamps: true");
        const schemaDecorator = schemaOpts.length > 0
            ? `@Schema({ ${schemaOpts.join(", ")} })`
            : `@Schema()`;

        // Optional lean interface
        const interfaceLines = this.opts.emitInterface
            ? this.buildLeanInterface(decl, schemaName, result)
            : [];

        const content = [
            imports.render(),
            "",
            schemaDecorator,
            `export class ${schemaName} {`,
            ...classLines.flatMap((l) => {
                if (l === "") return [""];
                return l.split("\n").map((sub) => `  ${sub}`);
            }),
            `}`,
            "",
            `export const ${schemaName}Schema = SchemaFactory.createForClass(${schemaName});`,
            "",
            ...interfaceLines,
        ].join("\n");

        return { filename: `${schemaName}.ts`, content };
    }

    // ── Field ─────────────────────────────────────────────────────────────────

    private generateField(
        field: ResolvedField,
        imports: ImportBuilder,
        result: ResolutionResult
    ): string[] {
        const lines: string[] = [];

        if (field.docs) {
            const docLines = field.docs.split("\n");
            if (docLines.length === 1) {
                lines.push(`/** ${docLines[0]} */`);
            } else {
                lines.push(`/**`);
                for (const dl of docLines) lines.push(` * ${dl}`);
                lines.push(` */`);
            }
        }

        const desc = this.buildPropDescriptor(field, result);
        lines.push(this.renderProp(desc, imports));

        const tsType = this.toTsType(field.type, result);
        lines.push(`${field.name}${field.optional ? "?" : "!"}: ${tsType};`);
        return lines;
    }

    // ── Prop descriptor ───────────────────────────────────────────────────────

    private buildPropDescriptor(field: ResolvedField, result: ResolutionResult): PropDescriptor {
        const desc: PropDescriptor = {};
        if (!field.optional) desc.required = true;
        this.applyTypeToProp(field.type, desc, result);
        return desc;
    }

    private applyTypeToProp(
        type: FieldType,
        desc: PropDescriptor,
        result: ResolutionResult,
        insideArray = false
    ): void {
        switch (type.kind) {
            case "primitive":
                desc.type = this.primitiveToMongooseType(type.type);
                return;

            case "literal":
                if (typeof type.value === "string") {
                    desc.type = "String";
                    desc.enum = `['${type.value}']`;
                } else if (typeof type.value === "number") {
                    desc.type = "Number";
                    desc.enum = `[${type.value}]`;
                } else {
                    desc.type = "Boolean";
                }
                return;

            case "enum":
                // Keep enum member values for `enum:` option; type depends on value kind
                desc.enum = type.name;
                desc.type = "String"; // enums are string-valued by convention; acceptable fallback
                return;

            case "reference": {
                const dep = result.declarations.find((d) => d.name === type.name);
                const schemaName = this.toClassName(type.name);
                if (dep?.kind === "interface") {
                    desc.type = schemaName;
                    desc.ref = schemaName;
                } else {
                    desc.type = schemaName;
                }
                return;
            }

            case "record":
                // Record<K, V> maps to a plain mixed object in Mongoose
                desc.type = "Map";
                return;

            case "array": {
                desc.isArray = true;
                const elem = type.elementType;
                if (elem.kind === "primitive") {
                    desc.type = `[${this.primitiveToMongooseType(elem.type)}]`;
                } else if (elem.kind === "reference") {
                    const dep = result.declarations.find((d) => d.name === elem.name);
                    const schemaName = this.toClassName(elem.name);
                    if (dep?.kind === "interface") {
                        desc.type = schemaName;
                        desc.ref = schemaName;
                    } else {
                        desc.type = schemaName;
                    }
                } else if (elem.kind === "enum") {
                    desc.enum = elem.name;
                    desc.type = "String";
                } else if (elem.kind === "union") {
                    // Array of union — use Mixed as a safe fallback
                    desc.type = "mongoose.Schema.Types.Mixed";
                } else {
                    desc.type = "mongoose.Schema.Types.Mixed";
                }
                return;
            }

            case "union": {
                // Strip null/undefined
                const sig = type.types.filter(
                    (t) => !(t.kind === "primitive" && (t.type === "null" || t.type === "undefined"))
                );
                if (sig.length === 0) return;
                if (sig.length === 1) { this.applyTypeToProp(sig[0], desc, result, insideArray); return; }
                // All literals → enum
                if (this.isAllLiterals(sig)) {
                    const firstKind = (sig[0] as { kind: "literal"; value: unknown }).value;
                    desc.type = typeof firstKind === "string" ? "String" : "Number";
                    desc.enum = this.buildLiteralEnumExpr(sig);
                    return;
                }
                // Mixed fallback
                desc.type = "mongoose.Schema.Types.Mixed";
                return;
            }
        }
    }

    private primitiveToMongooseType(prim: string): string {
        switch (prim) {
            case "string":  return "String";
            case "number":  return "Number";
            case "boolean": return "Boolean";
            case "Date":    return "Date";
            default:        return "mongoose.Schema.Types.Mixed";
        }
    }

    // ── Render @Prop ──────────────────────────────────────────────────────────

    private renderProp(desc: PropDescriptor, imports: ImportBuilder): string {
        // Ensure mongoose import when Mixed is used
        if (desc.type?.includes("mongoose.Schema.Types.Mixed")) {
            imports.add("mongoose", "mongoose");
        }

        const entries: string[] = [];

        if (desc.required === true) entries.push(`required: true`);

        if (desc.isArray && desc.ref) {
            // Embedded sub-document array: type: [SubSchema], _id: false optional
            entries.push(`type: [${desc.ref}]`);
        } else if (desc.isArray && desc.type) {
            entries.push(`type: ${desc.type}`);
        } else if (desc.ref) {
            // Embedded sub-document (non-array)
            entries.push(`type: ${desc.ref}`);
        } else if (desc.type) {
            entries.push(`type: ${desc.type}`);
        }

        if (desc.enum)    entries.push(`enum: ${desc.enum}`);
        if (desc.default) entries.push(`default: ${desc.default}`);

        if (entries.length === 0) return `@Prop()`;
        if (entries.length === 1) return `@Prop({ ${entries[0]} })`;

        const inner = entries.map((e) => `  ${e},`).join("\n");
        return `@Prop({\n${inner}\n})`;
    }

    // ── Lean interface ────────────────────────────────────────────────────────

    private buildLeanInterface(
        decl: ResolvedInterface,
        schemaName: string,
        result: ResolutionResult
    ): string[] {
        const lines: string[] = [];
        const baseName = schemaName.replace(new RegExp(`${this.opts.classSuffix}$`), "");
        lines.push(`/** Lean document interface for ${schemaName} */`);
        lines.push(`export interface I${baseName} {`);
        for (const field of decl.fields) {
            const tsType = this.toTsType(field.type, result);
            lines.push(`  ${field.name}${field.optional ? "?" : ""}: ${tsType};`);
        }
        lines.push(`}`);
        lines.push(``);
        return lines;
    }
}