#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { TypeResolver } from "./resolver";
import { NestSwaggerGenerator, NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
import { NestMongooseGenerator, NestMongooseGeneratorOptions } from "./nest-mongoose-generator";
import { ZodGenerator, ZodGeneratorOptions } from "./zod-generator";
import { GeneratedFile } from "./base-generator";

// ──────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ──────────────────────────────────────────────────────────────────────────────

type GeneratorKind = "swagger" | "mongoose" | "zod";

function printUsage(): void {
    console.log(`
NestJS Schema Generator
────────────────────────
Usage (single file):
  ts-node src/cli.ts <file> <InterfaceName> [options]

Usage (folder — generate for ALL exported interfaces in ALL .ts files):
  ts-node src/cli.ts --folder <dir> [options]

Arguments (single-file mode):
  file            Path to the TypeScript source file
  InterfaceName   Name of the interface or type alias to convert

Arguments (folder mode):
  --folder <dir>  Root folder to scan recursively for .ts files
                  Every exported interface / type alias in every file is
                  processed. Output mirrors the source folder structure.

Generator:
  --generator <kind>    Which generator to use: swagger (default) | mongoose | zod

Swagger options (--generator swagger):
  --suffix <suffix>     DTO class suffix (default: Dto)
  --no-validator        Disable class-validator decorators
  --no-transformer      Disable class-transformer @Type decorators

Mongoose options (--generator mongoose):
  --suffix <suffix>     Schema class suffix (default: EMPTY)
  --no-timestamps       Disable { timestamps: true } on @Schema()
  --emit-interface      Emit a companion lean document interface

Zod options (--generator zod):
  --suffix <suffix>     Base name suffix (default: EMPTY)
  --schema-suffix       Zod const name suffix (default: Schema)
  --no-type             Skip emitting inferred TypeScript types
  --strict              Add .strict() to object schemas

Shared options:
  --out <dir>           Output directory (default: ./generated)
  --barrel              Emit a barrel index.ts (single-file mode only)
  --dry-run             Print output to stdout instead of writing files
  --ignore <patterns>   Comma-separated substrings to skip in folder mode
                        (e.g. --ignore node_modules,dist,spec.ts)

Examples:
  ts-node src/cli.ts src/types/user.ts IUser
  ts-node src/cli.ts src/types/user.ts IUser --generator mongoose --out src/schemas
  ts-node src/cli.ts src/types/user.ts IUser --dry-run

  ts-node src/cli.ts --folder src/types --generator zod --out generated/zod
  ts-node src/cli.ts --folder src/types --generator mongoose --dry-run
  ts-node src/cli.ts --folder src --ignore node_modules,dist,spec.ts
`);
}

interface SharedCliOptions {
    out: string;
    kind: GeneratorKind;
    swaggerOpts: NestSwaggerGeneratorOptions;
    mongooseOpts: NestMongooseGeneratorOptions;
    zodOpts: ZodGeneratorOptions;
    dryRun: boolean;
}

interface SingleFileArgs extends SharedCliOptions {
    mode: "single";
    file: string;
    interfaceName: string;
}

interface FolderArgs extends SharedCliOptions {
    mode: "folder";
    folder: string;
    ignore: string[];
}

type CliArgs = SingleFileArgs | FolderArgs;

function parseSharedOptions(
    args: string[],
    start: number
): { opts: SharedCliOptions; barrel: boolean } {
    let out = "./generated";
    let dryRun = false;
    let barrel = false;
    let kind: GeneratorKind = "swagger";
    const swaggerOpts: NestSwaggerGeneratorOptions = {};
    const mongooseOpts: NestMongooseGeneratorOptions = {};
    const zodOpts: ZodGeneratorOptions = {};

    for (let i = start; i < args.length; i++) {
        switch (args[i]) {
            case "--generator":
                kind = args[++i] as GeneratorKind;
                if (kind !== "swagger" && kind !== "mongoose" && kind !== "zod") {
                    console.error(`Unknown generator: ${kind}. Must be 'swagger', 'mongoose', or 'zod'.`);
                    process.exit(1);
                }
                break;
            case "--out":
                out = args[++i];
                break;
            case "--suffix":
                swaggerOpts.classSuffix = args[++i];
                mongooseOpts.classSuffix = swaggerOpts.classSuffix;
                zodOpts.classSuffix = swaggerOpts.classSuffix;
                break;
            case "--schema-suffix":
                zodOpts.schemaSuffix = args[++i];
                break;
            case "--no-type":
                zodOpts.emitType = false;
                break;
            case "--strict":
                zodOpts.strict = true;
                break;
            case "--no-validator":
                swaggerOpts.classValidator = false;
                break;
            case "--no-transformer":
                swaggerOpts.classTransformer = false;
                break;
            case "--no-timestamps":
                mongooseOpts.timestamps = false;
                break;
            case "--emit-interface":
                mongooseOpts.emitInterface = true;
                break;
            case "--barrel":
                barrel = true;
                break;
            case "--dry-run":
                dryRun = true;
                break;
            // These are handled by the outer parser; skip with their value
            case "--folder":
            case "--ignore":
                i++;
                break;
            default:
                console.warn(`Unknown option: ${args[i]}`);
        }
    }

    return {
        opts: { out, kind, swaggerOpts, mongooseOpts, zodOpts, dryRun },
        barrel,
    };
}

function parseArgs(argv: string[]): CliArgs {
    const args = argv.slice(2);

    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        printUsage();
        process.exit(0);
    }

    // ── Folder mode ───────────────────────────────────────────────────────────
    const folderIdx = args.indexOf("--folder");
    if (folderIdx !== -1) {
        const folder = args[folderIdx + 1];
        if (!folder || folder.startsWith("--")) {
            console.error("Error: --folder requires a directory path.");
            process.exit(1);
        }

        const ignoreIdx = args.indexOf("--ignore");
        const ignore: string[] =
            ignoreIdx !== -1 && args[ignoreIdx + 1] && !args[ignoreIdx + 1].startsWith("--")
                ? args[ignoreIdx + 1].split(",").map((s) => s.trim())
                : [];

        const { opts } = parseSharedOptions(args, 0);
        return { mode: "folder", folder: path.resolve(folder), ignore, ...opts };
    }

    // ── Single-file mode ──────────────────────────────────────────────────────
    if (args.length < 2) {
        printUsage();
        process.exit(0);
    }

    const file = path.resolve(args[0]);
    const interfaceName = args[1];
    const { opts, barrel } = parseSharedOptions(args, 2);

    opts.swaggerOpts.emitBarrel = barrel;
    opts.mongooseOpts.emitBarrel = barrel;
    opts.zodOpts.emitBarrel = barrel;

    return { mode: "single", file, interfaceName, ...opts };
}

// ──────────────────────────────────────────────────────────────────────────────
// Generator helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildFiles(
    kind: GeneratorKind,
    swaggerOpts: NestSwaggerGeneratorOptions,
    mongooseOpts: NestMongooseGeneratorOptions,
    zodOpts: ZodGeneratorOptions,
    filePath: string,
    interfaceName: string
): GeneratedFile[] {
    const resolver = new TypeResolver(filePath);
    const result = resolver.resolve(interfaceName);

    if (kind === "mongoose") {
        return new NestMongooseGenerator(mongooseOpts).generate(result);
    } else if (kind === "zod") {
        return new ZodGenerator(zodOpts).generate(result);
    } else {
        return new NestSwaggerGenerator(swaggerOpts).generate(result);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Folder scanning helpers
// ──────────────────────────────────────────────────────────────────────────────

function collectTsFiles(dir: string, ignore: string[]): string[] {
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

            if (ignore.some((pattern) => rel.includes(pattern))) continue;

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

/**
 * Returns the names of all exported interfaces and type aliases in a file
 * that successfully resolve to an interface-shaped result.
 */
function getExportedInterfaceNames(filePath: string): string[] {
    const resolver = new TypeResolver(filePath);
    const allResults = resolver.resolveAll();

    const seen = new Set<string>();
    for (const r of allResults) {
        const roots = r.roots ?? [r.root];
        for (const root of roots) seen.add(root.name);
    }
    return [...seen];
}

// ──────────────────────────────────────────────────────────────────────────────
// Single-file mode
// ──────────────────────────────────────────────────────────────────────────────

async function runSingleFile(cliArgs: SingleFileArgs): Promise<void> {
    const { file, interfaceName, out, kind, swaggerOpts, mongooseOpts, zodOpts, dryRun } = cliArgs;

    if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
    }

    const label = kind === "mongoose" ? "Mongoose Schemas" : kind === "zod" ? "Zod Schemas" : "Swagger DTOs";
    console.log(`\n📦 Resolving "${interfaceName}" from ${file}...`);
    console.log(`   Generator: ${label}\n`);

    const resolver = new TypeResolver(file);
    let result;
    try {
        result = resolver.resolve(interfaceName);
    } catch (err: any) {
        console.error(`❌ Resolution failed: ${err.message}`);
        process.exit(1);
    }

    const isUnion = !!result.roots;
    const skipName = isUnion ? result.root.name : null;
    const emitted = result.declarations.filter((d) => d.name !== skipName);
    const stats = {
        interfaces: emitted.filter((d) => d.kind === "interface").length,
        enums: emitted.filter((d) => d.kind === "enum").length,
    };

    if (isUnion) {
        console.log(`✅ Union alias with ${result.roots!.length} member(s)`);
        console.log(`   Members: ${result.roots!.map((r) => r.name).join(", ")}\n`);
        console.log(`   Total resolved: ${stats.interfaces} interface(s), ${stats.enums} enum(s)\n`);
    } else {
        console.log(`✅ Resolved ${stats.interfaces} interface(s), ${stats.enums} enum(s)`);
        console.log(`   Declarations: ${emitted.map((d) => d.name).join(", ")}\n`);
    }

    let files: GeneratedFile[];
    if (kind === "mongoose") {
        files = new NestMongooseGenerator(mongooseOpts).generate(result);
    } else if (kind === "zod") {
        files = new ZodGenerator(zodOpts).generate(result);
    } else {
        files = new NestSwaggerGenerator(swaggerOpts).generate(result);
    }

    if (dryRun) {
        for (const f of files) {
            console.log(`${"─".repeat(60)}`);
            console.log(`// ${f.filename}`);
            console.log(`${"─".repeat(60)}`);
            console.log(f.content);
        }
        return;
    }

    const outDir = path.resolve(out);
    fs.mkdirSync(outDir, { recursive: true });

    for (const f of files) {
        const dest = path.join(outDir, f.filename);
        fs.writeFileSync(dest, f.content, "utf-8");
        console.log(`  📄 Written: ${dest}`);
    }

    console.log(`\n✨ Generated ${files.length} file(s) in ${outDir}\n`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Folder mode
// ──────────────────────────────────────────────────────────────────────────────

async function runFolder(cliArgs: FolderArgs): Promise<void> {
    const { folder, ignore, out, kind, swaggerOpts, mongooseOpts, zodOpts, dryRun } = cliArgs;

    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        console.error(`Error: Folder not found: ${folder}`);
        process.exit(1);
    }

    const label = kind === "mongoose" ? "Mongoose Schemas" : kind === "zod" ? "Zod Schemas" : "Swagger DTOs";
    console.log(`\n📂 Scanning folder: ${folder}`);
    console.log(`   Generator: ${label}`);
    if (ignore.length > 0) console.log(`   Ignoring:  ${ignore.join(", ")}`);
    console.log();

    const tsFiles = collectTsFiles(folder, ignore);

    if (tsFiles.length === 0) {
        console.log("⚠️  No .ts files found.\n");
        return;
    }

    console.log(`   Found ${tsFiles.length} TypeScript file(s)\n`);

    let totalWritten = 0;
    let totalInterfaces = 0;
    let skippedFiles = 0;

    for (const tsFile of tsFiles) {
        const rel = path.relative(folder, tsFile);

        // Discover exported interface names in this file
        let names: string[];
        try {
            names = getExportedInterfaceNames(tsFile);
        } catch (err: any) {
            console.warn(`  ⚠️  Skipping ${rel}: could not parse (${err.message})`);
            skippedFiles++;
            continue;
        }

        if (names.length === 0) continue;

        console.log(`  📄 ${rel}  →  ${names.join(", ")}`);

        // Mirror folder structure: src/user/user.types.ts → <out>/user/
        const relDir = path.dirname(rel);
        const subOutDir = path.join(path.resolve(out), relDir === "." ? "" : relDir);

        // Track already-written filenames within this source file to avoid
        // writing duplicate enum files when multiple interfaces share them.
        const writtenInFile = new Set<string>();

        for (const name of names) {
            let files: GeneratedFile[];
            try {
                files = buildFiles(kind, swaggerOpts, mongooseOpts, zodOpts, tsFile, name);
            } catch (err: any) {
                console.warn(`     ⚠️  "${name}" skipped: ${err.message}`);
                continue;
            }

            totalInterfaces++;

            if (dryRun) {
                for (const f of files) {
                    if (writtenInFile.has(f.filename)) continue;
                    writtenInFile.add(f.filename);
                    console.log(`\n${"─".repeat(60)}`);
                    console.log(`// [${rel}] ${f.filename}`);
                    console.log(`${"─".repeat(60)}`);
                    console.log(f.content);
                }
            } else {
                fs.mkdirSync(subOutDir, { recursive: true });
                for (const f of files) {
                    if (writtenInFile.has(f.filename)) continue;
                    writtenInFile.add(f.filename);
                    const dest = path.join(subOutDir, f.filename);
                    fs.writeFileSync(dest, f.content, "utf-8");
                    console.log(`     📄 ${path.relative(process.cwd(), dest)}`);
                    totalWritten++;
                }
            }
        }
    }

    console.log();

    if (dryRun) {
        console.log(`✨ Dry-run complete. Would generate from ${totalInterfaces} interface(s) across ${tsFiles.length - skippedFiles} file(s).\n`);
    } else {
        console.log(`✨ Done. ${totalWritten} file(s) generated from ${totalInterfaces} interface(s) → ${path.resolve(out)}\n`);
    }

    if (skippedFiles > 0) {
        console.warn(`   ⚠️  ${skippedFiles} file(s) skipped due to parse errors.\n`);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const cliArgs = parseArgs(process.argv);

    if (cliArgs.mode === "single") {
        await runSingleFile(cliArgs);
    } else {
        await runFolder(cliArgs);
    }
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
