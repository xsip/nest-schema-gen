import {
    Project,
    SourceFile,
    InterfaceDeclaration,
    TypeAliasDeclaration,
    EnumDeclaration,
    PropertySignature,
    Type,
    Symbol,
    Node,
    TypeNode,
    SyntaxKind,
} from "ts-morph";
import * as path from "path";
import * as fs from "fs";

// ──────────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────────

export type PrimitiveKind =
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "undefined"
    | "any"
    | "unknown"
    | "never"
    | "Date"
    | "object";

export interface PrimitiveFieldType {
    kind: "primitive";
    type: PrimitiveKind;
}
export interface ArrayFieldType {
    kind: "array";
    elementType: FieldType;
}
export interface RecordFieldType {
    kind: "record";
    keyType: FieldType;
    valueType: FieldType;
}
export interface ReferenceFieldType {
    kind: "reference";
    name: string;
}
export interface EnumFieldType {
    kind: "enum";
    name: string;
}
export interface UnionFieldType {
    kind: "union";
    types: FieldType[];
}
export interface LiteralFieldType {
    kind: "literal";
    value: string | number | boolean;
}

export type FieldType =
    | PrimitiveFieldType
    | ArrayFieldType
    | RecordFieldType
    | ReferenceFieldType
    | EnumFieldType
    | UnionFieldType
    | LiteralFieldType;

export interface ResolvedField {
    name: string;
    type: FieldType;
    optional: boolean;
    docs?: string;
}
export interface ResolvedInterface {
    name: string;
    fields: ResolvedField[];
    sourcePath: string;
}
export interface ResolvedEnum {
    name: string;
    members: Array<{ name: string; value: string | number }>;
    sourcePath: string;
}
export type ResolvedDeclaration =
    | ({ kind: "interface" } & ResolvedInterface)
    | ({ kind: "enum" } & ResolvedEnum);

export interface ResolutionResult {
    declarations: ResolvedDeclaration[];
    /** Single root (normal interface/type alias → DTO) */
    root: ResolvedInterface;
    /**
     * Set when the resolved name is a union-of-interfaces type alias
     * (e.g. `type Foo = A | B | C`). Each member is resolved independently.
     * When present, `root` is a synthetic placeholder and should be ignored
     * by the generator in favour of iterating `roots`.
     */
    roots?: ResolvedInterface[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Resolver
// ──────────────────────────────────────────────────────────────────────────────

export class TypeResolver {
    private project: Project;
    private resolved = new Map<string, ResolvedDeclaration>();
    private resolving = new Set<string>();

    constructor(private readonly rootFilePath: string) {
        this.project = new Project({
            tsConfigFilePath: this.findTsConfig(rootFilePath),
            skipAddingFilesFromTsConfig: true,
        });
        this.project.addSourceFileAtPath(rootFilePath);
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    resolve(interfaceName: string): ResolutionResult {
        const rootFile = this.project.getSourceFileOrThrow(this.rootFilePath);
        const rootDecl = this.findInterfaceOrAlias(rootFile, interfaceName);
        if (!rootDecl) {
            throw new Error(
                `Interface or type alias "${interfaceName}" not found in ${this.rootFilePath}`
            );
        }

        // Detect union-of-references type alias: `type Foo = A | B | C`
        // Each member is resolved independently; no wrapper DTO is emitted.
        if (Node.isTypeAliasDeclaration(rootDecl)) {
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
     * If `decl` is a type alias of the form `type X = A | B | C` where every
     * union member is a plain type reference (no primitives, no literals), return
     * the list of reference names.  Otherwise return null.
     */
    private tryGetUnionReferenceNames(
        decl: TypeAliasDeclaration
    ): string[] | null {
        const typeNode = decl.getTypeNode();
        if (!typeNode || !Node.isUnionTypeNode(typeNode)) return null;

        const names: string[] = [];
        for (const memberNode of typeNode.getTypeNodes()) {
            if (!Node.isTypeReference(memberNode)) return null; // mixed union → bail
            names.push(memberNode.getTypeName().getText());
        }
        return names.length > 0 ? names : null;
    }

    /**
     * Resolve every member of a union alias independently, collecting all
     * transitive declarations from each and merging them into one result set.
     */
    private resolveUnionAlias(
        aliasName: string,
        memberNames: string[],
        rootFile: SourceFile
    ): ResolutionResult {
        const roots: ResolvedInterface[] = [];

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
        const placeholder: ResolvedInterface = {
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
    private findDeclByNameInProject(
        name: string,
        startFile: SourceFile
    ): InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration | null {
        // 1. Check the start file directly
        const local = startFile.getInterface(name) ?? startFile.getTypeAlias(name) ?? startFile.getEnum(name);
        if (local) return local;

        // 2. Walk re-exports / imports by asking ts-morph to resolve the symbol
        //    through the type of the first union member type reference.
        //    We do this by finding a TypeAliasDeclaration in the root file whose
        //    type text contains this name, then following the symbol.
        const typeAlias = startFile.getTypeAliases().find((ta) => {
            const tn = ta.getTypeNode();
            if (!tn || !Node.isUnionTypeNode(tn)) return false;
            return tn.getTypeNodes().some(
                (n) => Node.isTypeReference(n) && n.getTypeName().getText() === name
            );
        });

        if (typeAlias) {
            const tn = typeAlias.getTypeNode()!;
            if (Node.isUnionTypeNode(tn)) {
                const memberNode = tn.getTypeNodes().find(
                    (n) => Node.isTypeReference(n) && n.getTypeName().getText() === name
                );
                if (memberNode) {
                    const sym =
                        memberNode.getType().getSymbol() ??
                        memberNode.getType().getAliasSymbol();
                    if (sym) {
                        for (const decl of sym.getDeclarations()) {
                            if (
                                Node.isInterfaceDeclaration(decl) ||
                                Node.isTypeAliasDeclaration(decl) ||
                                Node.isEnumDeclaration(decl)
                            ) {
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
            if (found) return found;
        }

        return null;
    }

    // ── Internal resolution ─────────────────────────────────────────────────────

    private resolveDeclaration(
        decl: InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration,
        nameOverride?: string
    ): void {
        const name = nameOverride ?? decl.getName();
        if (this.resolved.has(name) || this.resolving.has(name)) return;
        this.resolving.add(name);

        if (Node.isEnumDeclaration(decl)) {
            this.resolveEnum(decl, name);
        } else {
            this.resolveInterfaceOrAlias(decl, name);
        }

        this.resolving.delete(name);
    }

    private resolveEnum(decl: EnumDeclaration, name: string): void {
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

    private resolveInterfaceOrAlias(
        decl: InterfaceDeclaration | TypeAliasDeclaration,
        name: string
    ): void {
        const fields: ResolvedField[] = [];

        if (Node.isInterfaceDeclaration(decl)) {
            const allProps = this.collectInterfaceProperties(decl);
            for (const prop of allProps) {
                fields.push(this.resolveProperty(prop));
            }
        } else {
            const innerType = decl.getType();
            for (const sym of innerType.getProperties()) {
                const field = this.resolveSymbolProperty(sym, decl.getSourceFile());
                if (field) fields.push(field);
            }
        }

        this.resolved.set(name, {
            kind: "interface",
            name,
            fields,
            sourcePath: decl.getSourceFile().getFilePath(),
        });
    }

    private collectInterfaceProperties(
        iface: InterfaceDeclaration
    ): PropertySignature[] {
        // Child properties first, then inherited — Map preserves insertion order
        // and re-setting a key overwrites, so child wins on duplicates.
        const byName = new Map<string, PropertySignature>();

        // Walk parents first (depth-first) so child declarations overwrite them
        for (const ext of iface.getExtends()) {
            const sym = ext.getType().getSymbol();
            if (!sym) continue;
            for (const extDecl of sym.getDeclarations()) {
                if (Node.isInterfaceDeclaration(extDecl)) {
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

    private resolveProperty(prop: PropertySignature): ResolvedField {
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

    private resolveSymbolProperty(
        sym: Symbol,
        sourceFile: SourceFile
    ): ResolvedField | null {
        const decls = sym.getDeclarations();
        if (!decls.length) return null;
        const decl = decls[0];
        if (!Node.isPropertySignature(decl)) return null;
        return this.resolveProperty(decl);
    }

    // ── Type resolution ─────────────────────────────────────────────────────────

    private resolveType(
        type: Type,
        sourceFile: SourceFile,
        typeNode: TypeNode | null = null
    ): FieldType {
        // ── Check type node first for named references (enum / interface) ──────────
        // ts-morph expands enums into literal unions at the Type level, so we must
        // inspect the *written* type node to detect "SomeEnum" references.
        if (typeNode) {
            const named = this.tryResolveNamedTypeNode(typeNode, sourceFile);
            if (named) return named;
        }

        // ── null / undefined / never ───────────────────────────────────────────────
        if (type.isNull()) return { kind: "primitive", type: "null" };
        if (type.isUndefined()) return { kind: "primitive", type: "undefined" };
        if (type.isNever()) return { kind: "primitive", type: "never" };

        // ── Primitives ─────────────────────────────────────────────────────────────
        if (type.isString()) return { kind: "primitive", type: "string" };
        if (type.isStringLiteral())
            return { kind: "literal", value: type.getLiteralValue() as string };
        if (type.isNumber()) return { kind: "primitive", type: "number" };
        if (type.isNumberLiteral())
            return { kind: "literal", value: type.getLiteralValue() as number };
        if (type.isBoolean()) return { kind: "primitive", type: "boolean" };
        if (type.isBooleanLiteral())
            return { kind: "literal", value: type.getText() === "true" };
        if (type.isAny()) return { kind: "primitive", type: "any" };
        if (type.isUnknown()) return { kind: "primitive", type: "unknown" };

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
            if (elements.length === 0) return { kind: "primitive", type: "any" };
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
            if (enumName) return { kind: "enum", name: enumName };

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
            const merged: ResolvedField[] = [];
            for (const t of type.getIntersectionTypes()) {
                if (t.isObject()) {
                    for (const sym of t.getProperties()) {
                        const field = this.resolveSymbolProperty(sym, sourceFile);
                        if (field) merged.push(field);
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
        if (text === "Date") return { kind: "primitive", type: "Date" };

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
                        if (
                            Node.isInterfaceDeclaration(decl) ||
                            Node.isTypeAliasDeclaration(decl) ||
                            Node.isEnumDeclaration(decl)
                        ) {
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
                const syntheticName = `_Inline_${stableHash(
                    props.map((p) => p.getName()).join("_")
                )}`;
                if (!this.resolved.has(syntheticName)) {
                    const fields: ResolvedField[] = [];
                    for (const sym of props) {
                        const field = this.resolveSymbolProperty(sym, sourceFile);
                        if (field) fields.push(field);
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

    private tryResolveNamedTypeNode(
        typeNode: TypeNode,
        sourceFile: SourceFile
    ): FieldType | null {
        // TypeReference nodes: `Foo`, `Foo.Bar`, `Foo<T>`
        if (!Node.isTypeReference(typeNode)) return null;

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
        if (BUILTINS.has(writtenName)) return null;

        const resolvedType = typeNode.getType();

        // Prefer the alias symbol (ComputerActionList) over the expanded symbol (Array).
        // This is critical for type aliases like `type Foo = Array<Bar>` where
        // getSymbol() returns Array but getAliasSymbol() returns Foo.
        const sym = resolvedType.getAliasSymbol() ?? resolvedType.getSymbol();
        if (!sym) return null;

        // Skip if the *resolved* symbol name is a built-in (e.g. sym = Array when
        // writing `ComputerActionList` that aliases Array<T>) — in this case the
        // alias symbol check above should have caught the user alias first, but
        // guard here in case there is no alias symbol.
        if (BUILTINS.has(sym.getName())) return null;

        for (const decl of sym.getDeclarations()) {
            // ── Enum ────────────────────────────────────────────────────────────────
            if (Node.isEnumDeclaration(decl)) {
                const enumName = decl.getName();
                const filePath = decl.getSourceFile().getFilePath();
                if (!this.project.getSourceFile(filePath)) {
                    this.project.addSourceFileAtPath(filePath);
                }
                this.resolveDeclaration(decl, enumName);
                return { kind: "enum", name: enumName };
            }

            // ── Interface ──────────────────────────────────────────────────────────────
            if (Node.isInterfaceDeclaration(decl)) {
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
            if (Node.isTypeAliasDeclaration(decl)) {
                const aliasTypeNode = decl.getTypeNode();
                if (aliasTypeNode) {
                    // Array<T> or T[] alias → resolve as array, not a reference
                    if (Node.isArrayTypeNode(aliasTypeNode) ||
                        (Node.isTypeReference(aliasTypeNode) &&
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
                    if (Node.isUnionTypeNode(aliasTypeNode)) {
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
    private tryDetectEnumUnion(type: Type, sourceFile: SourceFile): string | null {
        const unionTypes = type.getUnionTypes();
        if (unionTypes.length === 0) return null;

        let enumName: string | null = null;
        for (const t of unionTypes) {
            if (!t.isEnumLiteral()) return null;
            const sym = t.getSymbol();
            if (!sym) return null;
            for (const decl of sym.getDeclarations()) {
                const parent = decl.getParent();
                if (!Node.isEnumDeclaration(parent)) return null;
                const name = parent.getName();
                if (enumName === null) {
                    enumName = name;
                    // Ensure the enum is resolved
                    const filePath = parent.getSourceFile().getFilePath();
                    if (!this.project.getSourceFile(filePath)) {
                        this.project.addSourceFileAtPath(filePath);
                    }
                    this.resolveDeclaration(parent, name);
                } else if (enumName !== name) {
                    return null; // members from different enums
                }
            }
        }
        return enumName;
    }

    // Unwrap T[] → TypeNode for T, or Array<T> → TypeNode for T
    private unwrapArrayTypeNode(typeNode: TypeNode): TypeNode | null {
        if (Node.isArrayTypeNode(typeNode)) {
            return typeNode.getElementTypeNode();
        }
        if (
            Node.isTypeReference(typeNode) &&
            typeNode.getTypeName().getText() === "Array"
        ) {
            const args = typeNode.getTypeArguments();
            return args[0] ?? null;
        }
        return null;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private findInterfaceOrAlias(
        file: SourceFile,
        name: string
    ): InterfaceDeclaration | TypeAliasDeclaration | null {
        return file.getInterface(name) ?? file.getTypeAlias(name) ?? null;
    }

    private findTsConfig(filePath: string): string | undefined {
        let dir = path.dirname(path.resolve(filePath));
        for (let i = 0; i < 10; i++) {
            const candidate = path.join(dir, "tsconfig.json");
            try {
                fs.accessSync(candidate);
                return candidate;
            } catch {
                const parent = path.dirname(dir);
                if (parent === dir) break;
                dir = parent;
            }
        }
        return undefined;
    }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function stableHash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}