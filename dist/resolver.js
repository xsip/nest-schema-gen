"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeResolver = void 0;
const ts_morph_1 = require("ts-morph");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// ──────────────────────────────────────────────────────────────────────────────
// Resolver
// ──────────────────────────────────────────────────────────────────────────────
class TypeResolver {
    constructor(rootFilePath) {
        this.rootFilePath = rootFilePath;
        this.resolved = new Map();
        this.resolving = new Set();
        this.project = new ts_morph_1.Project({
            tsConfigFilePath: this.findTsConfig(rootFilePath),
            skipAddingFilesFromTsConfig: true,
        });
        this.project.addSourceFileAtPath(rootFilePath);
    }
    // ── Public API ──────────────────────────────────────────────────────────────
    resolve(interfaceName) {
        const rootFile = this.project.getSourceFileOrThrow(this.rootFilePath);
        const rootDecl = this.findInterfaceOrAlias(rootFile, interfaceName);
        if (!rootDecl) {
            throw new Error(`Interface or type alias "${interfaceName}" not found in ${this.rootFilePath}`);
        }
        // Detect union-of-references type alias: `type Foo = A | B | C`
        // Each member is resolved independently; no wrapper DTO is emitted.
        if (ts_morph_1.Node.isTypeAliasDeclaration(rootDecl)) {
            const unionMembers = this.tryGetUnionReferenceNames(rootDecl);
            if (unionMembers) {
                return this.resolveUnionAlias(interfaceName, unionMembers, rootFile);
            }
        }
        this.resolveDeclaration(rootDecl, interfaceName);
        const root = this.resolved.get(interfaceName);
        if (!root || root.kind !== "interface") {
            throw new Error(`Failed to resolve "${interfaceName}" as an interface`);
        }
        return {
            declarations: Array.from(this.resolved.values()),
            root,
        };
    }
    /**
     * Resolve all exported interfaces and type aliases in the root file.
     * Returns one ResolutionResult per top-level exported name, skipping
     * names that fail to resolve (e.g. non-interface aliases like `type Id = string`).
     */
    resolveAll() {
        const rootFile = this.project.getSourceFileOrThrow(this.rootFilePath);
        const names = [
            ...rootFile.getInterfaces()
                .filter((i) => i.isExported())
                .map((i) => i.getName()),
            ...rootFile.getTypeAliases()
                .filter((a) => a.isExported())
                .map((a) => a.getName()),
        ];
        const results = [];
        for (const name of names) {
            // Fresh resolver state per name so declarations don't bleed across.
            const sub = new TypeResolver(this.rootFilePath);
            try {
                results.push(sub.resolve(name));
            }
            catch {
                // Skip aliases that don't resolve to an interface (e.g. primitive aliases)
            }
        }
        return results;
    }
    /**
     * If `decl` is a type alias of the form `type X = A | B | C` where every
     * union member is a plain type reference (no primitives, no literals), return
     * the list of reference names.  Otherwise return null.
     */
    tryGetUnionReferenceNames(decl) {
        const typeNode = decl.getTypeNode();
        if (!typeNode || !ts_morph_1.Node.isUnionTypeNode(typeNode))
            return null;
        const names = [];
        for (const memberNode of typeNode.getTypeNodes()) {
            if (!ts_morph_1.Node.isTypeReference(memberNode))
                return null; // mixed union → bail
            names.push(memberNode.getTypeName().getText());
        }
        return names.length > 0 ? names : null;
    }
    /**
     * Resolve every member of a union alias independently, collecting all
     * transitive declarations from each and merging them into one result set.
     */
    resolveUnionAlias(aliasName, memberNames, rootFile) {
        const roots = [];
        for (const memberName of memberNames) {
            // The member may be declared in the root file or in an imported file.
            // ts-morph's type checker can resolve it via the alias type node.
            const memberDecl = this.findDeclByNameInProject(memberName, rootFile);
            if (!memberDecl) {
                // Gracefully skip unresolvable members (e.g. externally declared types)
                console.warn(`  ⚠️  Could not resolve union member "${memberName}", skipping.`);
                continue;
            }
            this.resolveDeclaration(memberDecl, memberName);
            const resolved = this.resolved.get(memberName);
            if (resolved && resolved.kind === "interface") {
                roots.push(resolved);
            }
        }
        // Synthetic placeholder root (the union alias itself is not emitted as a DTO)
        const placeholder = {
            name: aliasName,
            fields: [],
            sourcePath: rootFile.getFilePath(),
        };
        return {
            declarations: Array.from(this.resolved.values()),
            root: placeholder,
            roots,
        };
    }
    /**
     * Find an interface/type-alias/enum declaration by name, searching first in
     * `startFile` and then across all files already added to the project (which
     * covers transitively imported modules).
     */
    findDeclByNameInProject(name, startFile) {
        // 1. Check the start file directly
        const local = startFile.getInterface(name) ?? startFile.getTypeAlias(name) ?? startFile.getEnum(name);
        if (local)
            return local;
        // 2. Walk re-exports / imports by asking ts-morph to resolve the symbol
        //    through the type of the first union member type reference.
        //    We do this by finding a TypeAliasDeclaration in the root file whose
        //    type text contains this name, then following the symbol.
        const typeAlias = startFile.getTypeAliases().find((ta) => {
            const tn = ta.getTypeNode();
            if (!tn || !ts_morph_1.Node.isUnionTypeNode(tn))
                return false;
            return tn.getTypeNodes().some((n) => ts_morph_1.Node.isTypeReference(n) && n.getTypeName().getText() === name);
        });
        if (typeAlias) {
            const tn = typeAlias.getTypeNode();
            if (ts_morph_1.Node.isUnionTypeNode(tn)) {
                const memberNode = tn.getTypeNodes().find((n) => ts_morph_1.Node.isTypeReference(n) && n.getTypeName().getText() === name);
                if (memberNode) {
                    const sym = memberNode.getType().getSymbol() ??
                        memberNode.getType().getAliasSymbol();
                    if (sym) {
                        for (const decl of sym.getDeclarations()) {
                            if (ts_morph_1.Node.isInterfaceDeclaration(decl) ||
                                ts_morph_1.Node.isTypeAliasDeclaration(decl) ||
                                ts_morph_1.Node.isEnumDeclaration(decl)) {
                                const filePath = decl.getSourceFile().getFilePath();
                                if (!this.project.getSourceFile(filePath)) {
                                    this.project.addSourceFileAtPath(filePath);
                                }
                                return decl;
                            }
                        }
                    }
                }
            }
        }
        // 3. Scan all already-loaded source files
        for (const sf of this.project.getSourceFiles()) {
            const found = sf.getInterface(name) ?? sf.getTypeAlias(name) ?? sf.getEnum(name);
            if (found)
                return found;
        }
        return null;
    }
    // ── Internal resolution ─────────────────────────────────────────────────────
    resolveDeclaration(decl, nameOverride) {
        const name = nameOverride ?? decl.getName();
        if (this.resolved.has(name) || this.resolving.has(name))
            return;
        this.resolving.add(name);
        if (ts_morph_1.Node.isEnumDeclaration(decl)) {
            this.resolveEnum(decl, name);
        }
        else {
            this.resolveInterfaceOrAlias(decl, name);
        }
        this.resolving.delete(name);
    }
    resolveEnum(decl, name) {
        const members = decl.getMembers().map((m) => {
            const val = m.getValue();
            return { name: m.getName(), value: val !== undefined ? val : m.getName() };
        });
        this.resolved.set(name, {
            kind: "enum",
            name,
            members,
            sourcePath: decl.getSourceFile().getFilePath(),
        });
    }
    resolveInterfaceOrAlias(decl, name) {
        const fields = [];
        if (ts_morph_1.Node.isInterfaceDeclaration(decl)) {
            const allProps = this.collectInterfaceProperties(decl);
            for (const prop of allProps) {
                fields.push(this.resolveProperty(prop));
            }
        }
        else {
            const innerType = decl.getType();
            for (const sym of innerType.getProperties()) {
                const field = this.resolveSymbolProperty(sym, decl.getSourceFile());
                if (field)
                    fields.push(field);
            }
        }
        this.resolved.set(name, {
            kind: "interface",
            name,
            fields,
            sourcePath: decl.getSourceFile().getFilePath(),
        });
    }
    collectInterfaceProperties(iface) {
        // Child properties first, then inherited — Map preserves insertion order
        // and re-setting a key overwrites, so child wins on duplicates.
        const byName = new Map();
        // Walk parents first (depth-first) so child declarations overwrite them
        for (const ext of iface.getExtends()) {
            const sym = ext.getType().getSymbol();
            if (!sym)
                continue;
            for (const extDecl of sym.getDeclarations()) {
                if (ts_morph_1.Node.isInterfaceDeclaration(extDecl)) {
                    for (const p of this.collectInterfaceProperties(extDecl)) {
                        byName.set(p.getName(), p);
                    }
                }
            }
        }
        // Own properties overwrite inherited ones with the same name
        for (const p of iface.getProperties()) {
            byName.set(p.getName(), p);
        }
        return [...byName.values()];
    }
    resolveProperty(prop) {
        const name = prop.getName();
        const optional = prop.hasQuestionToken();
        const docs = prop
            .getJsDocs()
            .map((d) => d.getDescription().trim())
            .filter(Boolean)
            .join("\n");
        // Pass both the resolved Type AND the written TypeNode so we can detect
        // enum references before ts-morph expands them to literal unions.
        const typeNode = prop.getTypeNode() ?? null;
        const type = this.resolveType(prop.getType(), prop.getSourceFile(), typeNode);
        return { name, type, optional, docs: docs || undefined };
    }
    resolveSymbolProperty(sym, sourceFile) {
        const decls = sym.getDeclarations();
        if (!decls.length)
            return null;
        const decl = decls[0];
        if (!ts_morph_1.Node.isPropertySignature(decl))
            return null;
        return this.resolveProperty(decl);
    }
    // ── Type resolution ─────────────────────────────────────────────────────────
    resolveType(type, sourceFile, typeNode = null) {
        // ── Check type node first for named references (enum / interface) ──────────
        // ts-morph expands enums into literal unions at the Type level, so we must
        // inspect the *written* type node to detect "SomeEnum" references.
        if (typeNode) {
            const named = this.tryResolveNamedTypeNode(typeNode, sourceFile);
            if (named)
                return named;
        }
        // ── null / undefined / never ───────────────────────────────────────────────
        if (type.isNull())
            return { kind: "primitive", type: "null" };
        if (type.isUndefined())
            return { kind: "primitive", type: "undefined" };
        if (type.isNever())
            return { kind: "primitive", type: "never" };
        // ── Primitives ─────────────────────────────────────────────────────────────
        if (type.isString())
            return { kind: "primitive", type: "string" };
        if (type.isStringLiteral())
            return { kind: "literal", value: type.getLiteralValue() };
        if (type.isNumber())
            return { kind: "primitive", type: "number" };
        if (type.isNumberLiteral())
            return { kind: "literal", value: type.getLiteralValue() };
        if (type.isBoolean())
            return { kind: "primitive", type: "boolean" };
        if (type.isBooleanLiteral())
            return { kind: "literal", value: type.getText() === "true" };
        if (type.isAny())
            return { kind: "primitive", type: "any" };
        if (type.isUnknown())
            return { kind: "primitive", type: "unknown" };
        // ── Array ──────────────────────────────────────────────────────────────────
        if (type.isArray()) {
            const elemType = type.getArrayElementTypeOrThrow();
            // Unwrap the element type node if possible (e.g. T[] → T, Array<T> → T)
            const elemTypeNode = typeNode
                ? this.unwrapArrayTypeNode(typeNode)
                : null;
            return {
                kind: "array",
                elementType: this.resolveType(elemType, sourceFile, elemTypeNode),
            };
        }
        // ── Tuple ──────────────────────────────────────────────────────────────────
        if (type.isTuple()) {
            const elements = type.getTupleElements();
            if (elements.length === 0)
                return { kind: "primitive", type: "any" };
            return {
                kind: "array",
                elementType: {
                    kind: "union",
                    types: elements.map((e) => this.resolveType(e, sourceFile)),
                },
            };
        }
        // ── Union ──────────────────────────────────────────────────────────────────
        if (type.isUnion()) {
            // First check if this union is an expanded enum (all members share an
            // enum parent symbol)
            const enumName = this.tryDetectEnumUnion(type, sourceFile);
            if (enumName)
                return { kind: "enum", name: enumName };
            const nonUndefined = type.getUnionTypes().filter((t) => !t.isUndefined());
            if (nonUndefined.length === 1) {
                return this.resolveType(nonUndefined[0], sourceFile);
            }
            return {
                kind: "union",
                types: nonUndefined.map((t) => this.resolveType(t, sourceFile)),
            };
        }
        // ── Intersection ───────────────────────────────────────────────────────────
        if (type.isIntersection()) {
            const merged = [];
            for (const t of type.getIntersectionTypes()) {
                if (t.isObject()) {
                    for (const sym of t.getProperties()) {
                        const field = this.resolveSymbolProperty(sym, sourceFile);
                        if (field)
                            merged.push(field);
                    }
                }
            }
            const hash = merged.map((f) => f.name).join("_");
            const syntheticName = `_Inline_${stableHash(hash)}`;
            if (!this.resolved.has(syntheticName)) {
                this.resolved.set(syntheticName, {
                    kind: "interface",
                    name: syntheticName,
                    fields: merged,
                    sourcePath: sourceFile.getFilePath(),
                });
            }
            return { kind: "reference", name: syntheticName };
        }
        // ── Date ───────────────────────────────────────────────────────────────────
        const text = type.getText();
        if (text === "Date")
            return { kind: "primitive", type: "Date" };
        // ── Record<K, V> ───────────────────────────────────────────────────────────
        if (text.startsWith("Record<")) {
            const typeArgs = type.getAliasTypeArguments();
            if (typeArgs.length === 2) {
                return {
                    kind: "record",
                    keyType: this.resolveType(typeArgs[0], sourceFile),
                    valueType: this.resolveType(typeArgs[1], sourceFile),
                };
            }
            return { kind: "primitive", type: "object" };
        }
        // ── Named object type (interface / type alias) ─────────────────────────────
        if (type.isObject()) {
            const sym = type.getSymbol() ?? type.getAliasSymbol();
            if (sym) {
                const typeName = sym.getName();
                if (!["Object", "Function", "Array", "Promise"].includes(typeName)) {
                    for (const decl of sym.getDeclarations()) {
                        if (ts_morph_1.Node.isInterfaceDeclaration(decl) ||
                            ts_morph_1.Node.isTypeAliasDeclaration(decl) ||
                            ts_morph_1.Node.isEnumDeclaration(decl)) {
                            const filePath = decl.getSourceFile().getFilePath();
                            if (!this.project.getSourceFile(filePath)) {
                                this.project.addSourceFileAtPath(filePath);
                            }
                            this.resolveDeclaration(decl, typeName);
                            const resolvedKind = this.resolved.get(typeName)?.kind;
                            return resolvedKind === "enum"
                                ? { kind: "enum", name: typeName }
                                : { kind: "reference", name: typeName };
                        }
                    }
                }
            }
            // Anonymous inline object
            const props = type.getProperties();
            if (props.length > 0) {
                const syntheticName = `_Inline_${stableHash(props.map((p) => p.getName()).join("_"))}`;
                if (!this.resolved.has(syntheticName)) {
                    const fields = [];
                    for (const sym of props) {
                        const field = this.resolveSymbolProperty(sym, sourceFile);
                        if (field)
                            fields.push(field);
                    }
                    this.resolved.set(syntheticName, {
                        kind: "interface",
                        name: syntheticName,
                        fields,
                        sourcePath: sourceFile.getFilePath(),
                    });
                }
                return { kind: "reference", name: syntheticName };
            }
        }
        return { kind: "primitive", type: "any" };
    }
    // ── Named type node inspection ──────────────────────────────────────────────
    // Resolves a written TypeNode like `UserRole` or `IAddress` to its declaration
    // without going through the expanded Type, which loses enum identity.
    tryResolveNamedTypeNode(typeNode, sourceFile) {
        // TypeReference nodes: `Foo`, `Foo.Bar`, `Foo<T>`
        if (!ts_morph_1.Node.isTypeReference(typeNode))
            return null;
        const writtenName = typeNode.getTypeName().getText();
        // Skip built-in / generic utility types we don't want to follow
        const BUILTINS = new Set([
            "Array",
            "Record",
            "Partial",
            "Required",
            "Readonly",
            "Pick",
            "Omit",
            "Promise",
            "Date",
            "string",
            "number",
            "boolean",
            "object",
        ]);
        if (BUILTINS.has(writtenName))
            return null;
        const resolvedType = typeNode.getType();
        // Prefer the alias symbol (ComputerActionList) over the expanded symbol (Array).
        // This is critical for type aliases like `type Foo = Array<Bar>` where
        // getSymbol() returns Array but getAliasSymbol() returns Foo.
        const sym = resolvedType.getAliasSymbol() ?? resolvedType.getSymbol();
        if (!sym)
            return null;
        // Skip if the *resolved* symbol name is a built-in (e.g. sym = Array when
        // writing `ComputerActionList` that aliases Array<T>) — in this case the
        // alias symbol check above should have caught the user alias first, but
        // guard here in case there is no alias symbol.
        if (BUILTINS.has(sym.getName()))
            return null;
        for (const decl of sym.getDeclarations()) {
            // ── Enum ────────────────────────────────────────────────────────────────
            if (ts_morph_1.Node.isEnumDeclaration(decl)) {
                const enumName = decl.getName();
                const filePath = decl.getSourceFile().getFilePath();
                if (!this.project.getSourceFile(filePath)) {
                    this.project.addSourceFileAtPath(filePath);
                }
                this.resolveDeclaration(decl, enumName);
                return { kind: "enum", name: enumName };
            }
            // ── Interface ──────────────────────────────────────────────────────────────
            if (ts_morph_1.Node.isInterfaceDeclaration(decl)) {
                const refName = decl.getName();
                const filePath = decl.getSourceFile().getFilePath();
                if (!this.project.getSourceFile(filePath)) {
                    this.project.addSourceFileAtPath(filePath);
                }
                this.resolveDeclaration(decl, refName);
                return { kind: "reference", name: refName };
            }
            // ── Type alias ─────────────────────────────────────────────────────────────
            // Before committing to a named reference, check if the alias is transparent
            // (i.e. it expands to an array, primitive, union, etc.) — if so, resolve it
            // structurally rather than creating a named DTO for it.
            if (ts_morph_1.Node.isTypeAliasDeclaration(decl)) {
                const aliasTypeNode = decl.getTypeNode();
                if (aliasTypeNode) {
                    // Array<T> or T[] alias → resolve as array, not a reference
                    if (ts_morph_1.Node.isArrayTypeNode(aliasTypeNode) ||
                        (ts_morph_1.Node.isTypeReference(aliasTypeNode) &&
                            aliasTypeNode.getTypeName().getText() === "Array")) {
                        const expandedType = decl.getType();
                        const elemTypeNode = this.unwrapArrayTypeNode(aliasTypeNode);
                        const elemType = expandedType.getArrayElementType();
                        if (elemType) {
                            return {
                                kind: "array",
                                elementType: this.resolveType(elemType, decl.getSourceFile(), elemTypeNode),
                            };
                        }
                    }
                    // Union alias (type Foo = A | B | C) → resolve as union inline,
                    // unless it's the root being explicitly requested (handled by resolveUnionAlias).
                    if (ts_morph_1.Node.isUnionTypeNode(aliasTypeNode)) {
                        const expandedType = decl.getType();
                        // Delegate to the normal union resolution path via resolveType
                        return this.resolveType(expandedType, decl.getSourceFile(), aliasTypeNode);
                    }
                }
                // Structural alias (type Foo = { ... }) — treat as named reference
                const refName = decl.getName();
                const filePath = decl.getSourceFile().getFilePath();
                if (!this.project.getSourceFile(filePath)) {
                    this.project.addSourceFileAtPath(filePath);
                }
                this.resolveDeclaration(decl, refName);
                return { kind: "reference", name: refName };
            }
        }
        return null;
    }
    // Detect expanded enums: a union whose every member is an enum member literal
    // sharing the same parent enum declaration.
    tryDetectEnumUnion(type, sourceFile) {
        const unionTypes = type.getUnionTypes();
        if (unionTypes.length === 0)
            return null;
        let enumName = null;
        for (const t of unionTypes) {
            if (!t.isEnumLiteral())
                return null;
            const sym = t.getSymbol();
            if (!sym)
                return null;
            for (const decl of sym.getDeclarations()) {
                const parent = decl.getParent();
                if (!ts_morph_1.Node.isEnumDeclaration(parent))
                    return null;
                const name = parent.getName();
                if (enumName === null) {
                    enumName = name;
                    // Ensure the enum is resolved
                    const filePath = parent.getSourceFile().getFilePath();
                    if (!this.project.getSourceFile(filePath)) {
                        this.project.addSourceFileAtPath(filePath);
                    }
                    this.resolveDeclaration(parent, name);
                }
                else if (enumName !== name) {
                    return null; // members from different enums
                }
            }
        }
        return enumName;
    }
    // Unwrap T[] → TypeNode for T, or Array<T> → TypeNode for T
    unwrapArrayTypeNode(typeNode) {
        if (ts_morph_1.Node.isArrayTypeNode(typeNode)) {
            return typeNode.getElementTypeNode();
        }
        if (ts_morph_1.Node.isTypeReference(typeNode) &&
            typeNode.getTypeName().getText() === "Array") {
            const args = typeNode.getTypeArguments();
            return args[0] ?? null;
        }
        return null;
    }
    // ── Helpers ─────────────────────────────────────────────────────────────────
    findInterfaceOrAlias(file, name) {
        return file.getInterface(name) ?? file.getTypeAlias(name) ?? null;
    }
    findTsConfig(filePath) {
        let dir = path.dirname(path.resolve(filePath));
        for (let i = 0; i < 10; i++) {
            const candidate = path.join(dir, "tsconfig.json");
            try {
                fs.accessSync(candidate);
                return candidate;
            }
            catch {
                const parent = path.dirname(dir);
                if (parent === dir)
                    break;
                dir = parent;
            }
        }
        return undefined;
    }
}
exports.TypeResolver = TypeResolver;
// ── Utils ─────────────────────────────────────────────────────────────────────
function stableHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}
