export { TypeResolver, ResolutionResult, ResolvedDeclaration, ResolvedInterface, ResolvedEnum, ResolvedField, FieldType } from "./resolver";
export { DtoGenerator, GeneratorOptions, GeneratedFile } from "./generator";

import * as path from "path";
import { TypeResolver } from "./resolver";
import { DtoGenerator, GeneratorOptions, GeneratedFile } from "./generator";

/**
 * One-shot API: resolve an interface and generate DTOs.
 *
 * @example
 * ```ts
 * import { generateDtos } from 'ts-dto-gen';
 * const files = generateDtos('./src/types/user.ts', 'IUser');
 * for (const f of files) {
 *   fs.writeFileSync(f.filename, f.content);
 * }
 * ```
 */
export function generateDtos(
    filePath: string,
    interfaceName: string,
    opts: GeneratorOptions = {}
): GeneratedFile[] {
    const resolver = new TypeResolver(path.resolve(filePath));
    const result = resolver.resolve(interfaceName);
    const generator = new DtoGenerator(opts);
    return generator.generate(result);
}