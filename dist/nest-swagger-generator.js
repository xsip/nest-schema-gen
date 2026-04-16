"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtoGenerator = exports.NestSwaggerGenerator = void 0;
const base_generator_1 = require("./base-generator");
class NestSwaggerGenerator extends base_generator_1.BaseGenerator {
    constructor(opts = {}) {
        // Support legacy dtoSuffix option
        const classSuffix = opts.classSuffix ?? opts.dtoSuffix ?? "Dto";
        super(opts, {
            classValidator: opts.classValidator ?? true,
            classTransformer: opts.classTransformer ?? true,
            classSuffix,
            emitBarrel: opts.emitBarrel ?? false,
            dtoSuffix: classSuffix,
        });
    }
    // ── Interface → DTO class ─────────────────────────────────────────────────
    generateInterface(decl, result) {
        const dtoName = this.toClassName(decl.name);
        const imports = new base_generator_1.ImportBuilder();
        imports.add("@nestjs/swagger", "ApiProperty");
        if (this.opts.classValidator)
            imports.reserve("class-validator");
        if (this.opts.classTransformer)
            imports.reserve("class-transformer");
        const resolvedByName = new Map(result.declarations.map((d) => [d.name, d]));
        // Collect DTO names that appear inside union types → need @ApiExtraModels
        const extraModelNames = [];
        for (const field of decl.fields) {
            this.collectUnionDtoNames(field.type, extraModelNames);
        }
        const extraModelDtoNames = [
            ...new Set(extraModelNames
                .filter((n) => resolvedByName.get(n)?.kind === "interface")
                .map((n) => this.toClassName(n))
                .filter((n) => n !== dtoName)),
        ];
        if (extraModelDtoNames.length > 0) {
            imports.add("@nestjs/swagger", "ApiExtraModels");
            imports.add("@nestjs/swagger", "getSchemaPath");
        }
        // Local imports for all referenced types
        const usedNames = new Set();
        for (const field of decl.fields)
            this.collectUsedNames(field.type, usedNames);
        for (const name of usedNames) {
            if (name === decl.name)
                continue;
            const dep = resolvedByName.get(name);
            if (!dep)
                continue;
            if (dep.kind === "enum") {
                imports.addLocal(`./${dep.name}`, dep.name);
            }
            else {
                const n = this.toClassName(dep.name);
                if (n !== dtoName)
                    imports.addLocal(`./${n}`, n);
            }
        }
        // Field lines
        const classLines = [];
        for (const field of decl.fields) {
            classLines.push(...this.generateField(field, imports, result), "");
        }
        if (classLines[classLines.length - 1] === "")
            classLines.pop();
        // Class decorators
        const classDecorators = [];
        if (extraModelDtoNames.length > 0) {
            classDecorators.push(`@ApiExtraModels(\n  ${extraModelDtoNames.join(",\n  ")},\n)`);
        }
        const content = [
            imports.render(),
            "",
            ...classDecorators,
            `export class ${dtoName} {`,
            ...classLines.flatMap((l) => {
                if (l === "")
                    return [""];
                return l.split("\n").map((sub) => `  ${sub}`);
            }),
            `}`,
            "",
        ].join("\n");
        return { filename: `${dtoName}.ts`, content };
    }
    // ── Field ─────────────────────────────────────────────────────────────────
    generateField(field, imports, result) {
        const lines = [];
        if (field.docs) {
            const docLines = field.docs.split("\n");
            if (docLines.length === 1) {
                lines.push(`/** ${docLines[0]} */`);
            }
            else {
                lines.push(`/**`);
                for (const dl of docLines)
                    lines.push(` * ${dl}`);
                lines.push(` */`);
            }
        }
        lines.push(this.renderApiProperty(this.buildDescriptor(field, result)));
        if (this.opts.classValidator)
            lines.push(...this.buildValidators(field, imports));
        if (this.opts.classTransformer) {
            const td = this.buildTypeDecorator(field.type, imports);
            if (td)
                lines.push(td);
        }
        const tsType = this.toTsType(field.type, result);
        lines.push(`${field.name}${field.optional ? "?" : "!"}: ${tsType};`);
        return lines;
    }
    // ── Descriptor ────────────────────────────────────────────────────────────
    buildDescriptor(field, result) {
        const desc = {};
        if (field.optional)
            desc.required = false;
        if (field.docs)
            desc.description = field.docs;
        this.applyTypeToDescriptor(field.type, desc, result);
        return desc;
    }
    applyTypeToDescriptor(type, desc, result) {
        switch (type.kind) {
            case "primitive":
                if (type.type === "Date") {
                    desc.type = "Date";
                    return;
                }
                if (type.type === "any" || type.type === "unknown" ||
                    type.type === "null" || type.type === "undefined" ||
                    type.type === "never" || type.type === "object")
                    return;
                desc.type = `'${type.type}'`;
                return;
            case "literal":
                if (typeof type.value === "string") {
                    desc.type = `'string'`;
                    desc.enum = `['${type.value}']`;
                }
                else if (typeof type.value === "number") {
                    desc.type = `'number'`;
                    desc.enum = `[${type.value}]`;
                }
                return;
            case "enum":
                desc.enum = type.name;
                return;
            case "reference":
                desc.type = `() => ${this.toClassName(type.name)}`;
                return;
            case "record":
                desc.type = `'object'`;
                return;
            case "array": {
                desc.isArray = true;
                const elem = type.elementType;
                if (elem.kind === "reference") {
                    desc.type = this.toClassName(elem.name);
                    return;
                }
                if (elem.kind === "enum") {
                    desc.enum = elem.name;
                    return;
                }
                if (elem.kind === "union") {
                    if (this.isAllLiterals(elem.types)) {
                        desc.enum = this.buildLiteralEnumExpr(elem.types);
                        return;
                    }
                    const entries = this.buildOneOfEntries({ kind: "union", types: elem.types }, result);
                    if (entries.length > 0) {
                        desc.oneOf = entries;
                        return;
                    }
                }
                if (elem.kind === "primitive" &&
                    elem.type !== "any" && elem.type !== "unknown" &&
                    elem.type !== "null" && elem.type !== "undefined") {
                    desc.type = `'${elem.type}'`;
                }
                return;
            }
            case "union": {
                const sig = type.types.filter((t) => !(t.kind === "primitive" && (t.type === "null" || t.type === "undefined")) &&
                    !(t.kind === "literal" && typeof t.value === "boolean"));
                if (sig.length === 0)
                    return;
                if (sig.length === 1) {
                    this.applyTypeToDescriptor(sig[0], desc, result);
                    return;
                }
                if (this.isAllLiterals(sig)) {
                    desc.enum = this.buildLiteralEnumExpr(sig);
                    return;
                }
                const arrays = sig.filter((t) => t.kind === "array");
                const nonArrays = sig.filter((t) => t.kind !== "array");
                if (arrays.length === 1) {
                    const arr = arrays[0];
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
                const entries = this.buildOneOfEntries({ kind: "union", types: sig }, result);
                if (entries.length > 0) {
                    desc.oneOf = entries;
                    return;
                }
                return;
            }
        }
    }
    // ── oneOf entries ─────────────────────────────────────────────────────────
    buildOneOfEntries(type, result) {
        const byName = new Map(result.declarations.map((d) => [d.name, d]));
        const entries = [];
        const seen = new Set();
        const walk = (t) => {
            if (t.kind === "union") {
                for (const m of t.types)
                    walk(m);
                return;
            }
            if (t.kind === "primitive") {
                if (t.type === "null" || t.type === "undefined" || t.type === "never" ||
                    t.type === "any" || t.type === "unknown" || t.type === "object")
                    return;
                const val = t.type === "Date" ? "Date" : `'${t.type}'`;
                const key = `type:${val}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    entries.push({ kind: "type", value: val });
                }
                return;
            }
            if (t.kind === "reference") {
                const dep = byName.get(t.name);
                if (dep && dep.kind === "interface") {
                    const dtoName = this.toClassName(t.name);
                    const key = `ref:${dtoName}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        entries.push({ kind: "ref", expr: `getSchemaPath(${dtoName})` });
                    }
                }
                return;
            }
            if (t.kind === "literal") {
                const val = typeof t.value === "string" ? `'string'` : `'number'`;
                const key = `type:${val}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    entries.push({ kind: "type", value: val });
                }
                return;
            }
        };
        walk(type);
        return entries;
    }
    // ── Render @ApiProperty ───────────────────────────────────────────────────
    renderApiProperty(desc) {
        const entries = [];
        if (desc.required === false)
            entries.push(`required: false`);
        if (desc.description != null)
            entries.push(`description: \`${desc.description.replace(/`/g, "\\`")}\``);
        if (desc.type != null)
            entries.push(`type: ${desc.type}`);
        if (desc.isArray === true)
            entries.push(`isArray: true`);
        if (desc.enum != null)
            entries.push(`enum: ${desc.enum}`);
        if (desc.example != null)
            entries.push(`example: ${desc.example}`);
        if (desc.oneOf == null || desc.oneOf.length === 0) {
            if (entries.length === 0)
                return `@ApiProperty()`;
            if (entries.length === 1)
                return `@ApiProperty({ ${entries[0]} })`;
            const inner = entries.map((e) => `  ${e},`).join("\n");
            return `@ApiProperty({\n${inner}\n})`;
        }
        const scalarLines = entries.map((e) => `  ${e},`);
        const refLines = desc.oneOf.map((entry) => {
            if (entry.kind === "ref")
                return `    { $ref: ${entry.expr} },`;
            return `    { type: ${entry.value} },`;
        });
        const allLines = [...scalarLines, `  oneOf: [`, ...refLines, `  ],`];
        return `@ApiProperty({\n${allLines.join("\n")}\n})`;
    }
    // ── class-validator ───────────────────────────────────────────────────────
    buildValidators(field, imports) {
        const decorators = [];
        const add = (name, args) => {
            imports.add("class-validator", name);
            decorators.push(`@${name}(${args ?? ""})`);
        };
        if (field.optional)
            add("IsOptional");
        this.addValidatorsForType(field.type, add, imports);
        return decorators;
    }
    addValidatorsForType(type, add, imports) {
        switch (type.kind) {
            case "primitive":
                if (type.type === "string") {
                    add("IsString");
                    break;
                }
                if (type.type === "number") {
                    add("IsNumber");
                    break;
                }
                if (type.type === "boolean") {
                    add("IsBoolean");
                    break;
                }
                if (type.type === "Date") {
                    add("IsDate");
                    break;
                }
                break;
            case "literal":
                if (typeof type.value === "string")
                    add("Equals", `'${type.value}'`);
                else if (typeof type.value === "number")
                    add("Equals", String(type.value));
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
                const sig = type.types.filter((t) => !(t.kind === "primitive" && (t.type === "null" || t.type === "undefined")) &&
                    !(t.kind === "literal" && typeof t.value === "boolean"));
                if (sig.length === 0)
                    break;
                if (this.isAllLiterals(sig)) {
                    const vals = sig.map((t) => (t.kind === "literal" ? t.value : null)).filter((v) => v !== null);
                    add("IsIn", `[${vals.map((v) => (typeof v === "string" ? `'${v}'` : v)).join(", ")}]`);
                }
                break;
            }
        }
    }
    // ── class-transformer ─────────────────────────────────────────────────────
    buildTypeDecorator(type, imports) {
        const inner = type.kind === "array" ? type.elementType : type;
        if (inner.kind === "reference") {
            imports.add("class-transformer", "Type");
            return `@Type(() => ${this.toClassName(inner.name)})`;
        }
        if (inner.kind === "primitive" && inner.type === "Date") {
            imports.add("class-transformer", "Transform");
            return `@Transform(({ value }) => new Date(value))`;
        }
        return null;
    }
}
exports.NestSwaggerGenerator = NestSwaggerGenerator;
exports.DtoGenerator = NestSwaggerGenerator;
