"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportBuilder = exports.BaseGenerator = void 0;
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
class BaseGenerator {
    constructor(opts, defaults) {
        this.opts = { ...defaults, ...opts };
    }
    // ── Public entry point ────────────────────────────────────────────────────
    generate(result) {
        const files = [];
        const skipNames = new Set(result.roots ? [result.root.name] : []);
        for (const decl of result.declarations) {
            if (skipNames.has(decl.name))
                continue;
            files.push(decl.kind === "enum"
                ? this.generateEnum(decl)
                : this.generateInterface(decl, result));
        }
        if (this.opts.emitBarrel) {
            const exports = files
                .map((f) => `export * from './${f.filename.replace(/\.ts$/, "")}';`)
                .join("\n");
            files.push({ filename: "index.ts", content: exports + "\n" });
        }
        return files;
    }
    // ── Shared: Enum generation ───────────────────────────────────────────────
    generateEnum(decl) {
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
    toClassName(name) {
        const stripped = name.replace(/^I([A-Z])/, "$1");
        const suffix = this.opts.classSuffix;
        return stripped.endsWith(suffix) ? stripped : `${stripped}${suffix}`;
    }
    // ── Shared: TypeScript type string ────────────────────────────────────────
    toTsType(type, result) {
        switch (type.kind) {
            case "primitive": return type.type;
            case "literal": return typeof type.value === "string" ? `'${type.value}'` : String(type.value);
            case "array": {
                const inner = this.toTsType(type.elementType, result);
                const needsParens = type.elementType.kind === "union";
                return needsParens ? `(${inner})[]` : `${inner}[]`;
            }
            case "reference": return this.toClassName(type.name);
            case "enum": return type.name;
            case "record": return `Record<${this.toTsType(type.keyType, result)}, ${this.toTsType(type.valueType, result)}>`;
            case "union": return type.types.map((t) => this.toTsType(t, result)).join(" | ");
            default: return "any";
        }
    }
    // ── Shared: name collection ───────────────────────────────────────────────
    collectUsedNames(type, out) {
        switch (type.kind) {
            case "reference":
                out.add(type.name);
                break;
            case "enum":
                out.add(type.name);
                break;
            case "array":
                this.collectUsedNames(type.elementType, out);
                break;
            case "record":
                this.collectUsedNames(type.keyType, out);
                this.collectUsedNames(type.valueType, out);
                break;
            case "union":
                for (const t of type.types)
                    this.collectUsedNames(t, out);
                break;
        }
    }
    collectUnionDtoNames(type, out) {
        if (type.kind === "union") {
            for (const t of type.types) {
                if (t.kind === "reference")
                    out.push(t.name);
                else
                    this.collectUnionDtoNames(t, out);
            }
        }
        else if (type.kind === "array") {
            this.collectUnionDtoNames(type.elementType, out);
        }
    }
    // ── Shared: union helpers ─────────────────────────────────────────────────
    isAllLiterals(types) {
        return types.length > 0 && types.every((t) => t.kind === "literal");
    }
    buildLiteralEnumExpr(types) {
        const vals = types
            .map((t) => (t.kind === "literal" ? t.value : null))
            .filter((v) => v !== null);
        return `[${vals.map((v) => (typeof v === "string" ? `'${v}'` : v)).join(", ")}]`;
    }
}
exports.BaseGenerator = BaseGenerator;
// ──────────────────────────────────────────────────────────────────────────────
// ImportBuilder  (shared utility, used by all generators)
// ──────────────────────────────────────────────────────────────────────────────
class ImportBuilder {
    constructor() {
        this.map = new Map();
        this.defaultMap = new Map();
    }
    add(module, name) {
        if (!this.map.has(module))
            this.map.set(module, new Set());
        this.map.get(module).add(name);
    }
    addDefault(module, name) {
        this.defaultMap.set(module, name);
    }
    reserve(module) {
        if (!this.map.has(module))
            this.map.set(module, new Set());
    }
    addLocal(module, name) {
        this.add(module, name);
    }
    render() {
        const lines = [];
        const external = [];
        const local = [];
        for (const [mod, names] of this.map.entries()) {
            const sorted = [...names].sort();
            if (sorted.length === 0)
                continue;
            (mod.startsWith(".") ? local : external).push([mod, sorted]);
        }
        const renderLine = (mod, namedNames) => {
            const defaultName = this.defaultMap.get(mod);
            if (defaultName && namedNames.length > 0) {
                return `import ${defaultName}, { ${namedNames.join(", ")} } from '${mod}';`;
            }
            else if (defaultName) {
                return `import ${defaultName} from '${mod}';`;
            }
            else {
                return `import { ${namedNames.join(", ")} } from '${mod}';`;
            }
        };
        const externalLines = external.map(([mod, names]) => renderLine(mod, names));
        for (const mod of this.defaultMap.keys()) {
            if (!mod.startsWith(".") && !external.find(([m]) => m === mod)) {
                externalLines.push(renderLine(mod, []));
            }
        }
        const localLines = local.map(([mod, names]) => renderLine(mod, names));
        lines.push(...externalLines);
        if (externalLines.length > 0 && localLines.length > 0)
            lines.push("");
        lines.push(...localLines);
        return lines.join("\n");
    }
}
exports.ImportBuilder = ImportBuilder;
