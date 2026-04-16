export type PrimitiveKind = "string" | "number" | "boolean" | "null" | "undefined" | "any" | "unknown" | "never" | "Date" | "object";
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
export type FieldType = PrimitiveFieldType | ArrayFieldType | RecordFieldType | ReferenceFieldType | EnumFieldType | UnionFieldType | LiteralFieldType;
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
    members: Array<{
        name: string;
        value: string | number;
    }>;
    sourcePath: string;
}
export type ResolvedDeclaration = ({
    kind: "interface";
} & ResolvedInterface) | ({
    kind: "enum";
} & ResolvedEnum);
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
export declare class TypeResolver {
    private readonly rootFilePath;
    private project;
    private resolved;
    private resolving;
    constructor(rootFilePath: string);
    resolve(interfaceName: string): ResolutionResult;
    /**
     * Resolve all exported interfaces and type aliases in the root file.
     * Returns one ResolutionResult per top-level exported name, skipping
     * names that fail to resolve (e.g. non-interface aliases like `type Id = string`).
     */
    resolveAll(): ResolutionResult[];
    /**
     * If `decl` is a type alias of the form `type X = A | B | C` where every
     * union member is a plain type reference (no primitives, no literals), return
     * the list of reference names.  Otherwise return null.
     */
    private tryGetUnionReferenceNames;
    /**
     * Resolve every member of a union alias independently, collecting all
     * transitive declarations from each and merging them into one result set.
     */
    private resolveUnionAlias;
    /**
     * Find an interface/type-alias/enum declaration by name, searching first in
     * `startFile` and then across all files already added to the project (which
     * covers transitively imported modules).
     */
    private findDeclByNameInProject;
    private resolveDeclaration;
    private resolveEnum;
    private resolveInterfaceOrAlias;
    private collectInterfaceProperties;
    private resolveProperty;
    private resolveSymbolProperty;
    private resolveType;
    private tryResolveNamedTypeNode;
    private tryDetectEnumUnion;
    private unwrapArrayTypeNode;
    private findInterfaceOrAlias;
    private findTsConfig;
}
