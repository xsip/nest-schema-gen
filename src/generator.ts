import {
    ResolvedDeclaration,
    ResolvedInterface,
    ResolvedEnum,
    ResolvedField,
    FieldType,
    ResolutionResult,
} from "./resolver";

export interface GeneratorOptions {
    classValidator?: boolean;
    classTransformer?: boolean;
    dtoSuffix?: string;
    emitBarrel?: boolean;
}

export interface GeneratedFile {
    filename: string;
    content: string;
}

// A oneOf entry is either a $ref to a DTO or an inline schema object like { type: 'string' }
type OneOfEntry =
    | { kind: "ref"; expr: string }      // { $ref: getSchemaPath(FooDto) }
    | { kind: "type"; value: string };   // { type: 'string' }

interface ApiPropDescriptor {
    required?: boolean;
    description?: string;
    type?: string;
    isArray?: boolean;
    enum?: string;
    example?: string;
    oneOf?: OneOfEntry[];
}

export class DtoGenerator {
    private opts: Required<GeneratorOptions>;

    constructor(opts: GeneratorOptions = {}) {
        this.opts = {
            classValidator: opts.classValidator ?? true,
            classTransformer: opts.classTransformer ?? true,
            dtoSuffix: opts.dtoSuffix ?? "Dto",
            emitBarrel: opts.emitBarrel ?? false,
        };
    }

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

    // ── Enum ────────────────────────────────────────────────────────────────────

    private generateEnum(decl: ResolvedEnum): GeneratedFile {
        const lines = [`export enum ${decl.name} {`];
        for (const m of decl.members) {
            const val = typeof m.value === "string" ? `'${m.value}'` : String(m.value);
            lines.push(`  ${m.name} = ${val},`);
        }
        lines.push(`}`);
        return { filename: `${decl.name}.ts`, content: lines.join("\n") + "\n" };
    }

    // ── Interface → DTO class ───────────────────────────────────────────────────

    private generateInterface(
        decl: ResolvedInterface,
        result: ResolutionResult
    ): GeneratedFile {
        const dtoName = this.toDtoName(decl.name);
        const imports = new ImportBuilder();

        imports.add("@nestjs/swagger", "ApiProperty");
        if (this.opts.classValidator) imports.reserve("class-validator");
        if (this.opts.classTransformer) imports.reserve("class-transformer");

        const resolvedByName = new Map(result.declarations.map((d) => [d.name, d]));

        // Collect DTO names that appear inside union types → need @ApiExtraModels
        const extraModelNames: string[] = [];
        for (const field of decl.fields) {
            this.collectUnionDtoNames(field.type, extraModelNames);
        }
        const extraModelDtoNames = [
            ...new Set(
                extraModelNames
                    .filter((n) => resolvedByName.get(n)?.kind === "interface")
                    .map((n) => this.toDtoName(n))
                    .filter((n) => n !== dtoName)
            ),
        ];

        if (extraModelDtoNames.length > 0) {
            imports.add("@nestjs/swagger", "ApiExtraModels");
            imports.add("@nestjs/swagger", "getSchemaPath");
        }

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
                const n = this.toDtoName(dep.name);
                if (n !== dtoName) imports.addLocal(`./${n}`, n);
            }
        }

        // Field lines
        const classLines: string[] = [];
        for (const field of decl.fields) {
            classLines.push(...this.generateField(field, imports, result), "");
        }
        if (classLines[classLines.length - 1] === "") classLines.pop();

        // Class decorators
        const classDecorators: string[] = [];
        if (extraModelDtoNames.length > 0) {
            classDecorators.push(
                `@ApiExtraModels(\n  ${extraModelDtoNames.join(",\n  ")},\n)`
            );
        }

        const content = [
            imports.render(),
            "",
            ...classDecorators,
            `export class ${dtoName} {`,
            ...classLines.flatMap((l) => {
                if (l === "") return [""];
                return l.split("\n").map((sub) => `  ${sub}`);
            }),
            `}`,
            "",
        ].join("\n");

        return { filename: `${dtoName}.ts`, content };
    }

    // ── Field ───────────────────────────────────────────────────────────────────

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

        lines.push(this.renderApiProperty(this.buildDescriptor(field, result)));
        if (this.opts.classValidator) lines.push(...this.buildValidators(field, imports));
        if (this.opts.classTransformer) {
            const td = this.buildTypeDecorator(field.type, imports);
            if (td) lines.push(td);
        }

        const tsType = this.toTsType(field.type, result);
        lines.push(`${field.name}${field.optional ? "?" : "!"}: ${tsType};`);
        return lines;
    }

    // ── Descriptor ──────────────────────────────────────────────────────────────

    private buildDescriptor(field: ResolvedField, result: ResolutionResult): ApiPropDescriptor {
        const desc: ApiPropDescriptor = {};
        if (field.optional) desc.required = false;
        if (field.docs) desc.description = field.docs;
        this.applyTypeToDescriptor(field.type, desc, result);
        return desc;
    }

    private applyTypeToDescriptor(type: FieldType, desc: ApiPropDescriptor, result: ResolutionResult): void {
        switch (type.kind) {
            case "primitive":
                if (type.type === "Date") { desc.type = "Date"; return; }
                if (type.type === "any" || type.type === "unknown" ||
                    type.type === "null" || type.type === "undefined" ||
                    type.type === "never" || type.type === "object") return;
                desc.type = `'${type.type}'`;
                return;

            case "literal":
                // Emit a single-value enum so OpenAPI client generators (e.g. openapi-generator
                // for Angular) produce a typed constant/enum for discriminant fields like
                // type: 'response.created'. A plain `example` is only documentation and
                // is ignored by client generators.
                if (typeof type.value === "string") {
                    desc.type = `'string'`;
                    desc.enum = `['${type.value}']`;
                } else if (typeof type.value === "number") {
                    desc.type = `'number'`;
                    desc.enum = `[${type.value}]`;
                }
                // boolean literals don't need enum — true/false are the only values anyway
                return;

            case "enum":
                desc.enum = type.name;
                return;

            case "reference":
                desc.type = `() => ${this.toDtoName(type.name)}`;
                return;

            case "record":
                desc.type = `'object'`;
                return;

            case "array": {
                desc.isArray = true;
                const elem = type.elementType;
                if (elem.kind === "reference") { desc.type = this.toDtoName(elem.name); return; }
                if (elem.kind === "enum") { desc.enum = elem.name; return; }
                if (elem.kind === "union") {
                    if (this.isAllLiterals(elem.types)) { desc.enum = this.buildLiteralEnumExpr(elem.types); return; }
                    const entries = this.buildOneOfEntries({ kind: "union", types: elem.types }, result);
                    if (entries.length > 0) { desc.oneOf = entries; return; }
                }
                if (elem.kind === "primitive" &&
                    elem.type !== "any" && elem.type !== "unknown" &&
                    elem.type !== "null" && elem.type !== "undefined") {
                    desc.type = `'${elem.type}'`;
                }
                return;
            }

            case "union": {
                const sig = type.types.filter(
                    (t) =>
                        !(t.kind === "primitive" && (t.type === "null" || t.type === "undefined")) &&
                        !(t.kind === "literal" && typeof t.value === "boolean")
                );
                if (sig.length === 0) return;
                if (sig.length === 1) { this.applyTypeToDescriptor(sig[0], desc, result); return; }
                if (this.isAllLiterals(sig)) { desc.enum = this.buildLiteralEnumExpr(sig); return; }

                // Check for the `string | SomeArrayAlias` pattern:
                // if exactly one member is an array, set isArray and fold its element
                // types together with any remaining primitive/DTO members into oneOf.
                const arrays = sig.filter((t) => t.kind === "array");
                const nonArrays = sig.filter((t) => t.kind !== "array");
                if (arrays.length === 1) {
                    const arr = arrays[0] as { kind: "array"; elementType: FieldType };
                    // Collect all types to put into oneOf:
                    // - primitives/DTOs from the non-array members (e.g. `string`)
                    // - element types of the array member
                    const elemTypes = arr.elementType.kind === "union"
                        ? arr.elementType.types
                        : [arr.elementType];
                    const allMembers = [...nonArrays, ...elemTypes];
                    const entries = this.buildOneOfEntries({ kind: "union", types: allMembers }, result);
                    if (entries.length > 0) {
                        desc.isArray = true;
                        desc.oneOf = entries;
                        return;
                    }
                }

                // Plain union of DTOs (and possibly primitives)
                const entries = this.buildOneOfEntries({ kind: "union", types: sig }, result);
                if (entries.length > 0) { desc.oneOf = entries; return; }
                return;
            }
        }
    }

    // ── Build oneOf entries (refs + primitive types) ────────────────────────────

    /**
     * Walk a union type and collect OneOfEntry items:
     * - DTO references → { kind: "ref", expr: "getSchemaPath(FooDto)" }
     * - Primitive types → { kind: "type", value: "'string'" }
     * Ignores null/undefined/bool-literals.
     */
    private buildOneOfEntries(type: FieldType, result: ResolutionResult): OneOfEntry[] {
        const byName = new Map(result.declarations.map((d) => [d.name, d]));
        const entries: OneOfEntry[] = [];
        const seen = new Set<string>();

        const walk = (t: FieldType) => {
            if (t.kind === "union") {
                for (const m of t.types) walk(m);
                return;
            }
            if (t.kind === "primitive") {
                if (t.type === "null" || t.type === "undefined" || t.type === "never" ||
                    t.type === "any" || t.type === "unknown" || t.type === "object") return;
                const val = t.type === "Date" ? "Date" : `'${t.type}'`;
                const key = `type:${val}`;
                if (!seen.has(key)) { seen.add(key); entries.push({ kind: "type", value: val }); }
                return;
            }
            if (t.kind === "reference") {
                const dep = byName.get(t.name);
                if (dep && dep.kind === "interface") {
                    const dtoName = this.toDtoName(t.name);
                    const key = `ref:${dtoName}`;
                    if (!seen.has(key)) { seen.add(key); entries.push({ kind: "ref", expr: `getSchemaPath(${dtoName})` }); }
                }
                return;
            }
            if (t.kind === "literal") {
                // Literal string/number in a union — treat as inline type
                const val = typeof t.value === "string" ? `'string'` : `'number'`;
                const key = `type:${val}`;
                if (!seen.has(key)) { seen.add(key); entries.push({ kind: "type", value: val }); }
                return;
            }
        };

        walk(type);
        return entries;
    }

    // ── Render @ApiProperty ─────────────────────────────────────────────────────

    private renderApiProperty(desc: ApiPropDescriptor): string {
        const entries: string[] = [];
        if (desc.required === false)  entries.push(`required: false`);
        if (desc.description != null) entries.push(`description: \`${desc.description.replace(/`/g, "\\`")}\``);
        if (desc.type != null)        entries.push(`type: ${desc.type}`);
        if (desc.isArray === true)    entries.push(`isArray: true`);
        if (desc.enum != null)        entries.push(`enum: ${desc.enum}`);
        if (desc.example != null)     entries.push(`example: ${desc.example}`);

        // No oneOf → normal scalar rendering
        if (desc.oneOf == null || desc.oneOf.length === 0) {
            if (entries.length === 0) return `@ApiProperty()`;
            if (entries.length === 1) return `@ApiProperty({ ${entries[0]} })`;
            const inner = entries.map((e) => `  ${e},`).join("\n");
            return `@ApiProperty({\n${inner}\n})`;
        }

        // oneOf always multi-line with { $ref: ... } or { type: ... } per entry
        const scalarLines = entries.map((e) => `  ${e},`);
        const refLines = desc.oneOf.map((entry) => {
            if (entry.kind === "ref") return `    { $ref: ${entry.expr} },`;
            return `    { type: ${entry.value} },`;
        });
        const allLines = [...scalarLines, `  oneOf: [`, ...refLines, `  ],`];
        return `@ApiProperty({\n${allLines.join("\n")}\n})`;
    }

    // ── Union helpers ───────────────────────────────────────────────────────────

    private isAllLiterals(types: FieldType[]): boolean {
        return types.length > 0 && types.every((t) => t.kind === "literal");
    }

    private buildLiteralEnumExpr(types: FieldType[]): string {
        const vals = types.map((t) => (t.kind === "literal" ? t.value : null)).filter((v) => v !== null);
        return `[${vals.map((v) => (typeof v === "string" ? `'${v}'` : v)).join(", ")}]`;
    }

    /** @deprecated use buildOneOfEntries instead for new union handling */
    private collectUnionRefDtoNames(type: FieldType, result: ResolutionResult): string[] {
        return this.buildOneOfEntries(type, result)
            .filter((e): e is { kind: "ref"; expr: string } => e.kind === "ref")
            .map((e) => e.expr.replace(/^getSchemaPath\(/, "").replace(/\)$/, ""));
    }

    private collectUnionDtoNames(type: FieldType, out: string[]): void {
        if (type.kind === "union") {
            for (const t of type.types) {
                if (t.kind === "reference") out.push(t.name);
                else this.collectUnionDtoNames(t, out);
            }
        } else if (type.kind === "array") {
            this.collectUnionDtoNames(type.elementType, out);
        }
    }

    // ── class-validator ─────────────────────────────────────────────────────────

    private buildValidators(field: ResolvedField, imports: ImportBuilder): string[] {
        const decorators: string[] = [];
        const add = (name: string, args?: string) => {
            imports.add("class-validator", name);
            decorators.push(`@${name}(${args ?? ""})`);
        };
        if (field.optional) add("IsOptional");
        this.addValidatorsForType(field.type, add, imports);
        return decorators;
    }

    private addValidatorsForType(
        type: FieldType,
        add: (name: string, args?: string) => void,
        imports: ImportBuilder
    ): void {
        switch (type.kind) {
            case "primitive":
                if (type.type === "string")  { add("IsString"); break; }
                if (type.type === "number")  { add("IsNumber"); break; }
                if (type.type === "boolean") { add("IsBoolean"); break; }
                if (type.type === "Date")    { add("IsDate"); break; }
                break;
            case "literal":
                if (typeof type.value === "string") add("Equals", `'${type.value}'`);
                else if (typeof type.value === "number") add("Equals", String(type.value));
                // boolean literals: no class-validator equivalent, skip
                break;
            case "array":
                add("IsArray");
                if (type.elementType.kind === "reference" || type.elementType.kind === "array") {
                    imports.add("class-validator", "ValidateNested");
                    add("ValidateNested", "{ each: true }");
                }
                break;
            case "reference":
                imports.add("class-validator", "ValidateNested");
                add("ValidateNested");
                break;
            case "enum":
                imports.add("class-validator", "IsEnum");
                add("IsEnum", type.name);
                break;
            case "union": {
                const sig = type.types.filter(
                    (t) =>
                        !(t.kind === "primitive" && (t.type === "null" || t.type === "undefined")) &&
                        !(t.kind === "literal" && typeof t.value === "boolean")
                );
                if (sig.length === 0) break;
                if (this.isAllLiterals(sig)) {
                    const vals = sig.map((t) => (t.kind === "literal" ? t.value : null)).filter((v) => v !== null);
                    add("IsIn", `[${vals.map((v) => (typeof v === "string" ? `'${v}'` : v)).join(", ")}]`);
                }
                break;
            }
        }
    }

    // ── class-transformer ───────────────────────────────────────────────────────

    private buildTypeDecorator(type: FieldType, imports: ImportBuilder): string | null {
        const inner = type.kind === "array" ? type.elementType : type;
        if (inner.kind === "reference") {
            imports.add("class-transformer", "Type");
            return `@Type(() => ${this.toDtoName(inner.name)})`;
        }
        if (inner.kind === "primitive" && inner.type === "Date") {
            imports.add("class-transformer", "Transform");
            return `@Transform(({ value }) => new Date(value))`;
        }
        return null;
    }

    // ── TypeScript type string ──────────────────────────────────────────────────

    private toTsType(type: FieldType, result: ResolutionResult): string {
        switch (type.kind) {
            case "primitive": return type.type;
            case "literal": return typeof type.value === "string" ? `'${type.value}'` : String(type.value);
            case "array": {
                const inner = this.toTsType(type.elementType, result);
                const needsParens = type.elementType.kind === "union";
                return needsParens ? `(${inner})[]` : `${inner}[]`;
            }
            case "reference": return this.toDtoName(type.name);
            case "enum": return type.name;
            case "record": return `Record<${this.toTsType(type.keyType, result)}, ${this.toTsType(type.valueType, result)}>`;
            case "union": return type.types.map((t) => this.toTsType(t, result)).join(" | ");
            default: return "any";
        }
    }

    // ── Naming ──────────────────────────────────────────────────────────────────

    private toDtoName(name: string): string {
        const stripped = name.replace(/^I([A-Z])/, "$1");
        const suffix = this.opts.dtoSuffix;
        return stripped.endsWith(suffix) ? stripped : `${stripped}${suffix}`;
    }

    // ── Collect all referenced names ────────────────────────────────────────────

    private collectUsedNames(type: FieldType, out: Set<string>): void {
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
}

// ──────────────────────────────────────────────────────────────────────────────
// ImportBuilder
// ──────────────────────────────────────────────────────────────────────────────

class ImportBuilder {
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