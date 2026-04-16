export { TypeResolver, ResolutionResult, ResolvedDeclaration, ResolvedInterface, ResolvedEnum, ResolvedField, FieldType } from "./resolver";
export { BaseGenerator, BaseGeneratorOptions, GeneratedFile, ImportBuilder } from "./base-generator";
export { NestSwaggerGenerator, NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
export { NestMongooseGenerator, NestMongooseGeneratorOptions } from "./nest-mongoose-generator";
export { ZodGenerator, ZodGeneratorOptions } from "./zod-generator";
export { DtoGenerator, GeneratorOptions } from "./nest-swagger-generator";
import { NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
import { NestMongooseGeneratorOptions } from "./nest-mongoose-generator";
import { ZodGeneratorOptions } from "./zod-generator";
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
export declare function generateDtos(filePath: string, interfaceName: string, opts?: NestSwaggerGeneratorOptions): GeneratedFile[];
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
export declare function generateSchemas(filePath: string, interfaceName: string, opts?: NestMongooseGeneratorOptions): GeneratedFile[];
/**
 * One-shot API: resolve an interface and generate Zod schemas.
 *
 * @example
 * ```ts
 * import { generateZodSchemas } from 'nest-schema-gen';
 * const files = generateZodSchemas('./src/types/user.ts', 'IUser');
 * for (const f of files) fs.writeFileSync(f.filename, f.content);
 * ```
 */
export declare function generateZodSchemas(filePath: string, interfaceName: string, opts?: ZodGeneratorOptions): GeneratedFile[];
