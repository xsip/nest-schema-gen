import { ResolvedInterface, ResolvedEnum, FieldType, ResolutionResult } from "./resolver";
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
export declare abstract class BaseGenerator<TOptions extends BaseGeneratorOptions> {
    protected opts: Required<TOptions>;
    constructor(opts: TOptions, defaults: Required<TOptions>);
    generate(result: ResolutionResult): GeneratedFile[];
    /** Generate a single interface/class file. */
    protected abstract generateInterface(decl: ResolvedInterface, result: ResolutionResult): GeneratedFile;
    protected generateEnum(decl: ResolvedEnum): GeneratedFile;
    /**
     * Strip a leading `I` from interface names and append the configured suffix.
     * e.g. `IUser` → `UserDto` (with suffix "Dto")
     */
    protected toClassName(name: string): string;
    protected toTsType(type: FieldType, result: ResolutionResult): string;
    protected collectUsedNames(type: FieldType, out: Set<string>): void;
    protected collectUnionDtoNames(type: FieldType, out: string[]): void;
    protected isAllLiterals(types: FieldType[]): boolean;
    protected buildLiteralEnumExpr(types: FieldType[]): string;
}
export declare class ImportBuilder {
    private map;
    add(module: string, name: string): void;
    reserve(module: string): void;
    addLocal(module: string, name: string): void;
    render(): string;
}
