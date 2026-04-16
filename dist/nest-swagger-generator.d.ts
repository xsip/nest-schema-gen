import { ResolvedInterface, ResolutionResult } from "./resolver";
import { BaseGenerator, BaseGeneratorOptions, GeneratedFile } from "./base-generator";
export interface NestSwaggerGeneratorOptions extends BaseGeneratorOptions {
    classValidator?: boolean;
    classTransformer?: boolean;
    /** @deprecated use classSuffix */
    dtoSuffix?: string;
}
export declare class NestSwaggerGenerator extends BaseGenerator<NestSwaggerGeneratorOptions> {
    constructor(opts?: NestSwaggerGeneratorOptions);
    protected generateInterface(decl: ResolvedInterface, result: ResolutionResult): GeneratedFile;
    private generateField;
    private buildDescriptor;
    private applyTypeToDescriptor;
    private buildOneOfEntries;
    private renderApiProperty;
    private buildValidators;
    private addValidatorsForType;
    private buildTypeDecorator;
}
/** @deprecated Use NestSwaggerGenerator */
export { NestSwaggerGenerator as DtoGenerator };
export type { NestSwaggerGeneratorOptions as GeneratorOptions };
