import { ResolutionResult } from "./resolver";
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
export declare class DtoGenerator {
    private opts;
    constructor(opts?: GeneratorOptions);
    generate(result: ResolutionResult): GeneratedFile[];
    private generateEnum;
    private generateInterface;
    private generateField;
    private buildDescriptor;
    private applyTypeToDescriptor;
    /**
     * Walk a union type and collect OneOfEntry items:
     * - DTO references → { kind: "ref", expr: "getSchemaPath(FooDto)" }
     * - Primitive types → { kind: "type", value: "'string'" }
     * Ignores null/undefined/bool-literals.
     */
    private buildOneOfEntries;
    private renderApiProperty;
    private isAllLiterals;
    private buildLiteralEnumExpr;
    /** @deprecated use buildOneOfEntries instead for new union handling */
    private collectUnionRefDtoNames;
    private collectUnionDtoNames;
    private buildValidators;
    private addValidatorsForType;
    private buildTypeDecorator;
    private toTsType;
    private toDtoName;
    private collectUsedNames;
}
