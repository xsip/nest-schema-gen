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
export interface FolderGenerationResult {
    /** Source file path (absolute) */
    sourceFile: string;
    /** Interface or type alias name that was resolved */
    interfaceName: string;
    /** Generated files for this interface */
    files: GeneratedFile[];
}
export interface GenerateFromFolderOptions {
    /** Sub-strings to exclude when walking the folder (e.g. ["node_modules", "dist", "spec.ts"]) */
    ignore?: string[];
}
/**
 * Walk `folderPath` recursively, resolve every exported interface/type alias
 * in every `.ts` file, and run the given generator on each.
 *
 * Returns a flat list of `FolderGenerationResult` entries — one per
 * (source-file × interface) combination.
 *
 * @example
 * ```ts
 * import { generateDtosFromFolder } from 'nest-schema-gen';
 * const results = generateDtosFromFolder('./src/types');
 * for (const r of results) {
 *   for (const f of r.files) fs.writeFileSync(f.filename, f.content);
 * }
 * ```
 */
export declare function generateDtosFromFolder(folderPath: string, opts?: NestSwaggerGeneratorOptions, folderOpts?: GenerateFromFolderOptions): FolderGenerationResult[];
/**
 * Walk `folderPath` recursively and generate Mongoose schemas for every
 * exported interface/type alias found.
 *
 * @example
 * ```ts
 * import { generateSchemasFromFolder } from 'nest-schema-gen';
 * const results = generateSchemasFromFolder('./src/types');
 * ```
 */
export declare function generateSchemasFromFolder(folderPath: string, opts?: NestMongooseGeneratorOptions, folderOpts?: GenerateFromFolderOptions): FolderGenerationResult[];
/**
 * Walk `folderPath` recursively and generate Zod schemas for every
 * exported interface/type alias found.
 *
 * @example
 * ```ts
 * import { generateZodSchemasFromFolder } from 'nest-schema-gen';
 * const results = generateZodSchemasFromFolder('./src/types');
 * ```
 */
export declare function generateZodSchemasFromFolder(folderPath: string, opts?: ZodGeneratorOptions, folderOpts?: GenerateFromFolderOptions): FolderGenerationResult[];
