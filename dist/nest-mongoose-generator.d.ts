import { ResolvedInterface, ResolutionResult } from "./resolver";
import { BaseGenerator, BaseGeneratorOptions, GeneratedFile } from "./base-generator";
export interface NestMongooseGeneratorOptions extends BaseGeneratorOptions {
    /**
     * When true, adds `{ timestamps: true }` to `@Schema()`.
     * @default true
     */
    timestamps?: boolean;
    /**
     * When true, generates a companion TypeScript interface (`IFoo`) in the
     * same file so callers can type lean Mongoose documents.
     * @default false
     */
    emitInterface?: boolean;
}
export declare class NestMongooseGenerator extends BaseGenerator<NestMongooseGeneratorOptions> {
    constructor(opts?: NestMongooseGeneratorOptions);
    protected generateInterface(decl: ResolvedInterface, result: ResolutionResult): GeneratedFile;
    private generateField;
    private buildPropDescriptor;
    private applyTypeToProp;
    private primitiveToMongooseType;
    private renderProp;
    private buildLeanInterface;
}
