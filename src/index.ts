export { TypeResolver, ResolutionResult, ResolvedDeclaration, ResolvedInterface, ResolvedEnum, ResolvedField, FieldType } from "./resolver";
export { BaseGenerator, BaseGeneratorOptions, GeneratedFile, ImportBuilder } from "./base-generator";
export { NestSwaggerGenerator, NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
export { NestMongooseGenerator, NestMongooseGeneratorOptions } from "./nest-mongoose-generator";

// Legacy re-exports for backwards compatibility
export { DtoGenerator, GeneratorOptions } from "./nest-swagger-generator";

import * as path from "path";
import { TypeResolver } from "./resolver";
import { NestSwaggerGenerator, NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
import { NestMongooseGenerator, NestMongooseGeneratorOptions } from "./nest-mongoose-generator";
import { GeneratedFile } from "./base-generator";

/**
 * One-shot API: resolve an interface and generate Swagger DTOs.
 *
 * @example
 * ```ts
 * import { generateDtos } from 'nest-schema-gen';
 * const files = generateDtos('./src/types/user.ts', 'IUser');
 * for (const f of files) fs.writeFileSync(f.filename, f.content);
 * ```
 */
export function generateDtos(
    filePath: string,
    interfaceName: string,
    opts: NestSwaggerGeneratorOptions = {}
): GeneratedFile[] {
    const resolver = new TypeResolver(path.resolve(filePath));
    const result = resolver.resolve(interfaceName);
    return new NestSwaggerGenerator(opts).generate(result);
}

/**
 * One-shot API: resolve an interface and generate Mongoose schemas.
 *
 * @example
 * ```ts
 * import { generateSchemas } from 'nest-schema-gen';
 * const files = generateSchemas('./src/types/user.ts', 'IUser');
 * for (const f of files) fs.writeFileSync(f.filename, f.content);
 * ```
 */
export function generateSchemas(
    filePath: string,
    interfaceName: string,
    opts: NestMongooseGeneratorOptions = {}
): GeneratedFile[] {
    const resolver = new TypeResolver(path.resolve(filePath));
    const result = resolver.resolve(interfaceName);
    return new NestMongooseGenerator(opts).generate(result);
}