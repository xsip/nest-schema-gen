"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodGenerator = void 0;
const base_generator_1 = require("./base-generator");
class ZodGenerator extends base_generator_1.BaseGenerator {
    constructor(opts = {}) {
        super(opts, {
            classSuffix: opts.classSuffix ?? "",
            emitBarrel: opts.emitBarrel ?? false,
            emitType: opts.emitType ?? true,
            schemaSuffix: opts.schemaSuffix ?? "Schema",
            strict: opts.strict ?? false,
        });
    }
    // ── Override: enums become z.enum([...]) consts ───────────────────────────
    generateEnum(decl) {
        const schemaName = `${decl.name}${this.opts.schemaSuffix}`;
        const values = decl.members.map((m) => typeof m.value === "string" ? `'${m.value}'` : String(m.value));
        const lines = [];
        lines.push(`import { z } from 'zod';`);
        lines.push(``);
        // Re-export a native TS enum so other files can still import the enum
        lines.push(`export enum ${decl.name} {`);
        for (const m of decl.members) {
            const val = typeof m.value === "string" ? `'${m.value}'` : String(m.value);
            lines.push(`  ${m.name} = ${val},`);
        }
        lines.push(`}`);
        lines.push(``);
        // Zod schema: z.nativeEnum for TS enum
        lines.push(`export const ${schemaName} = z.nativeEnum(${decl.name});`);
        lines.push(``);
        if (this.opts.emitType) {
            lines.push(`export type ${decl.name}Type = z.infer<typeof ${schemaName}>;`);
            lines.push(``);
        }
        return { filename: `${decl.name}.ts`, content: lines.join("\n") };
    }
    // ── Interface → Zod object schema ─────────────────────────────────────────
    generateInterface(decl, result) {
        const baseName = this.toClassName(decl.name);
        const schemaName = `${baseName}${this.opts.schemaSuffix}`;
        const imports = new base_generator_1.ImportBuilder();
        imports.add("zod", "z");
        // Collect local imports
        const resolvedByName = new Map(result.declarations.map((d) => [d.name, d]));
        const usedNames = new Set();
        for (const field of decl.fields)
            this.collectUsedNames(field.type, usedNames);
        for (const name of usedNames) {
            if (name === decl.name)
                continue;
            const dep = resolvedByName.get(name);
            if (!dep)
                continue;
            const depSchemaName = `${this.toClassName(dep.name)}${this.opts.schemaSuffix}`;
            if (depSchemaName !== schemaName) {
                imports.addLocal(`./${this.toClassName(dep.name)}`, depSchemaName);
            }
        }
        // Build field expressions
        const fieldLines = [];
        for (const field of decl.fields) {
            if (field.docs) {
                const docLines = field.docs.split("\n");
                if (docLines.length === 1) {
                    fieldLines.push(`  /** ${docLines[0]} */`);
                }
                else {
                    fieldLines.push(`  /**`);
                    for (const dl of docLines)
                        fieldLines.push(`   * ${dl}`);
                    fieldLines.push(`   */`);
                }
            }
            const expr = this.buildFieldExpr(field, result);
            fieldLines.push(`  ${field.name}: ${expr},`);
        }
        // Compose schema
        const strictSuffix = this.opts.strict ? ".strict()" : "";
        const schemaBody = fieldLines.length === 0
            ? `z.object({})${strictSuffix}`
            : `z.object({\n${fieldLines.join("\n")}\n})${strictSuffix}`;
        const lines = [];
        lines.push(imports.render());
        lines.push("");
        lines.push(`export const ${schemaName} = ${schemaBody};`);
        lines.push("");
        if (this.opts.emitType) {
            lines.push(`export type ${baseName} = z.infer<typeof ${schemaName}>;`);
            lines.push("");
        }
        return { filename: `${baseName}.ts`, content: lines.join("\n") };
    }
    // ── Build Zod expression for a single field ────────────────────────────────
    buildFieldExpr(field, result) {
        let expr = this.buildTypeExpr(field.type, result);
        // If the field type itself is a union containing null/undefined, those
        // are already handled inside buildTypeExpr. For a plain optional field
        // (not in the union) we append .optional().
        const typeIsUnion = field.type.kind === "union";
        if (field.optional && !typeIsUnion) {
            expr += ".optional()";
        }
        return expr;
    }
    // ── Build Zod expression for a FieldType ──────────────────────────────────
    buildTypeExpr(type, result) {
        switch (type.kind) {
            case "primitive":
                return this.primitiveToZod(type.type);
            case "literal": {
                if (typeof type.value === "string")
                    return `z.literal('${type.value}')`;
                if (typeof type.value === "boolean")
                    return `z.literal(${type.value})`;
                return `z.literal(${type.value})`;
            }
            case "enum": {
                const dep = result.declarations.find((d) => d.name === type.name);
                const schemaName = `${this.toClassName(type.name)}${this.opts.schemaSuffix}`;
                if (dep?.kind === "enum")
                    return schemaName;
                // fallback — treat as z.string()
                return "z.string()";
            }
            case "reference": {
                const schemaName = `${this.toClassName(type.name)}${this.opts.schemaSuffix}`;
                return schemaName;
            }
            case "array": {
                const inner = this.buildTypeExpr(type.elementType, result);
                return `z.array(${inner})`;
            }
            case "record": {
                const key = this.buildTypeExpr(type.keyType, result);
                const val = this.buildTypeExpr(type.valueType, result);
                return `z.record(${key}, ${val})`;
            }
            case "union": {
                // Separate nullable/undefinable from real types
                const nullTypes = type.types.filter((t) => t.kind === "primitive" && t.type === "null");
                const undefTypes = type.types.filter((t) => t.kind === "primitive" && t.type === "undefined");
                const significant = type.types.filter((t) => !(t.kind === "primitive" && (t.type === "null" || t.type === "undefined")));
                let base;
                if (significant.length === 0) {
                    base = "z.unknown()";
                }
                else if (significant.length === 1) {
                    base = this.buildTypeExpr(significant[0], result);
                }
                else if (this.isAllLiterals(significant)) {
                    // z.enum([...]) for string-literal unions, z.union([z.literal(...)]) otherwise
                    const allStrings = significant.every((t) => t.kind === "literal" && typeof t.value === "string");
                    if (allStrings) {
                        const vals = significant.map((t) => `'${t.value}'`).join(", ");
                        base = `z.enum([${vals}])`;
                    }
                    else {
                        const members = significant.map((t) => this.buildTypeExpr(t, result)).join(", ");
                        base = `z.union([${members}])`;
                    }
                }
                else {
                    const members = significant.map((t) => this.buildTypeExpr(t, result)).join(", ");
                    base = `z.union([${members}])`;
                }
                if (nullTypes.length > 0)
                    base += ".nullable()";
                if (undefTypes.length > 0)
                    base += ".optional()";
                return base;
            }
            default:
                return "z.unknown()";
        }
    }
    // ── Primitive mapping ──────────────────────────────────────────────────────
    primitiveToZod(prim) {
        switch (prim) {
            case "string": return "z.string()";
            case "number": return "z.number()";
            case "boolean": return "z.boolean()";
            case "Date": return "z.coerce.date()";
            case "null": return "z.null()";
            case "undefined": return "z.undefined()";
            case "any": return "z.any()";
            case "unknown": return "z.unknown()";
            case "never": return "z.never()";
            case "object": return "z.record(z.string(), z.unknown())";
            default: return "z.unknown()";
        }
    }
}
exports.ZodGenerator = ZodGenerator;
