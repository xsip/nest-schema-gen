export { TypeResolver, ResolutionResult, ResolvedDeclaration, ResolvedInterface, ResolvedEnum, ResolvedField, FieldType } from "./resolver";
export { BaseGenerator, BaseGeneratorOptions, GeneratedFile, ImportBuilder } from "./base-generator";
export { NestSwaggerGenerator, NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
export { NestMongooseGenerator, NestMongooseGeneratorOptions } from "./nest-mongoose-generator";
export { ZodGenerator, ZodGeneratorOptions } from "./zod-generator";

// Legacy re-exports for backwards compatibility
export { DtoGenerator, GeneratorOptions } from "./nest-swagger-generator";

import * as path from "path";
import { TypeResolver } from "./resolver";
import { NestSwaggerGenerator, NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
import { NestMongooseGenerator, NestMongooseGeneratorOptions } from "./nest-mongoose-generator";
import { ZodGenerator, ZodGeneratorOptions } from "./zod-generator";
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
export function generateZodSchemas(
    filePath: string,
    interfaceName: string,
    opts: ZodGeneratorOptions = {}
): GeneratedFile[] {
    const resolver = new TypeResolver(path.resolve(filePath));
    const result = resolver.resolve(interfaceName);
    return new ZodGenerator(opts).generate(result);
}

// ──────────────────────────────────────────────────────────────────────────────
// Folder API
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from "fs";

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
export function generateDtosFromFolder(
    folderPath: string,
    opts: NestSwaggerGeneratorOptions = {},
    folderOpts: GenerateFromFolderOptions = {}
): FolderGenerationResult[] {
    return _generateFromFolder(folderPath, folderOpts, (resolver, result) =>
        new NestSwaggerGenerator(opts).generate(result)
    );
}

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
export function generateSchemasFromFolder(
    folderPath: string,
    opts: NestMongooseGeneratorOptions = {},
    folderOpts: GenerateFromFolderOptions = {}
): FolderGenerationResult[] {
    return _generateFromFolder(folderPath, folderOpts, (resolver, result) =>
        new NestMongooseGenerator(opts).generate(result)
    );
}

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
export function generateZodSchemasFromFolder(
    folderPath: string,
    opts: ZodGeneratorOptions = {},
    folderOpts: GenerateFromFolderOptions = {}
): FolderGenerationResult[] {
    return _generateFromFolder(folderPath, folderOpts, (resolver, result) =>
        new ZodGenerator(opts).generate(result)
    );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _collectTsFiles(dir: string, ignore: string[]): string[] {
    const results: string[] = [];

    function walk(current: string): void {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            const rel = path.relative(dir, fullPath);
            if (ignore.some((p) => rel.includes(p))) continue;
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (
                entry.isFile() &&
                entry.name.endsWith(".ts") &&
                !entry.name.endsWith(".d.ts")
            ) {
                results.push(fullPath);
            }
        }
    }

    walk(dir);
    return results;
}

function _generateFromFolder(
    folderPath: string,
    folderOpts: GenerateFromFolderOptions,
    generate: (resolver: TypeResolver, result: import("./resolver").ResolutionResult) => GeneratedFile[]
): FolderGenerationResult[] {
    const abs = path.resolve(folderPath);
    const ignore = folderOpts.ignore ?? [];
    const tsFiles = _collectTsFiles(abs, ignore);
    const out: FolderGenerationResult[] = [];

    for (const tsFile of tsFiles) {
        const resolver = new TypeResolver(tsFile);
        let allResults: import("./resolver").ResolutionResult[];
        try {
            allResults = resolver.resolveAll();
        } catch {
            continue;
        }

        for (const result of allResults) {
            const roots = result.roots ?? [result.root];
            for (const root of roots) {
                try {
                    const files = generate(resolver, result);
                    out.push({ sourceFile: tsFile, interfaceName: root.name, files });
                } catch {
                    // skip individual failures
                }
            }
        }
    }

    return out;
}