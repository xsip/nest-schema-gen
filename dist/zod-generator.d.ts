import { ResolvedInterface, ResolvedEnum, ResolutionResult } from "./resolver";
import { BaseGenerator, BaseGeneratorOptions, GeneratedFile } from "./base-generator";
export interface ZodGeneratorOptions extends BaseGeneratorOptions {
    /**
     * When true, generates a companion TypeScript type inferred from the Zod
     * schema (`export type Foo = z.infer<typeof FooSchema>`).
     * @default true
     */
    emitType?: boolean;
    /**
     * Suffix appended to the generated Zod schema const name.
     * e.g. `User` → `UserSchema` (default: "Schema")
     */
    schemaSuffix?: string;
    /**
     * When true, emits `.strict()` on object schemas so that unknown keys
     * cause a parse error instead of being stripped.
     * @default false
     */
    strict?: boolean;
}
export declare class ZodGenerator extends BaseGenerator<ZodGeneratorOptions> {
    constructor(opts?: ZodGeneratorOptions);
    protected generateEnum(decl: ResolvedEnum): GeneratedFile;
    protected generateInterface(decl: ResolvedInterface, result: ResolutionResult): GeneratedFile;
    private buildFieldExpr;
    private buildTypeExpr;
    private primitiveToZod;
}
