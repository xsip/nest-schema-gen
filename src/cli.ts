#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { TypeResolver } from "./resolver";
import { NestSwaggerGenerator, NestSwaggerGeneratorOptions } from "./nest-swagger-generator";
import { NestMongooseGenerator, NestMongooseGeneratorOptions } from "./nest-mongoose-generator";
import { GeneratedFile } from "./base-generator";

// ──────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ──────────────────────────────────────────────────────────────────────────────

type GeneratorKind = "swagger" | "mongoose";

function printUsage(): void {
    console.log(`
NestJS Schema Generator
────────────────────────
Usage:
  ts-node src/cli.ts <file> <InterfaceName> [options]

Arguments:
  file            Path to the TypeScript source file
  InterfaceName   Name of the interface or type alias to convert

Generator:
  --generator <kind>    Which generator to use: swagger (default) | mongoose

Swagger options (--generator swagger):
  --suffix <suffix>     DTO class suffix (default: Dto)
  --no-validator        Disable class-validator decorators
  --no-transformer      Disable class-transformer @Type decorators

Mongoose options (--generator mongoose):
  --suffix <suffix>     Schema class suffix (default: EMPTY)
  --no-timestamps       Disable { timestamps: true } on @Schema()
  --emit-interface      Emit a companion lean document interface

Shared options:
  --out <dir>           Output directory (default: ./generated)
  --barrel              Emit a barrel index.ts
  --dry-run             Print output to stdout instead of writing files

Examples:
  ts-node src/cli.ts src/types/user.ts IUser
  ts-node src/cli.ts src/types/user.ts IUser --generator mongoose --out src/schemas
  ts-node src/cli.ts src/types/user.ts IUser --dry-run
`);
}

interface CliArgs {
    file: string;
    interfaceName: string;
    out: string;
    kind: GeneratorKind;
    swaggerOpts: NestSwaggerGeneratorOptions;
    mongooseOpts: NestMongooseGeneratorOptions;
    dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
    const args = argv.slice(2); // strip node + script

    if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
        printUsage();
        process.exit(0);
    }

    const file = path.resolve(args[0]);
    const interfaceName = args[1];

    let out = "./generated";
    let dryRun = false;
    let kind: GeneratorKind = "swagger";
    const swaggerOpts: NestSwaggerGeneratorOptions = {};
    const mongooseOpts: NestMongooseGeneratorOptions = {};

    for (let i = 2; i < args.length; i++) {
        switch (args[i]) {
            case "--generator":
                kind = args[++i] as GeneratorKind;
                if (kind !== "swagger" && kind !== "mongoose") {
                    console.error(`Unknown generator: ${kind}. Must be 'swagger' or 'mongoose'.`);
                    process.exit(1);
                }
                break;
            case "--out":
                out = args[++i];
                break;
            case "--suffix":
                swaggerOpts.classSuffix = args[++i];
                mongooseOpts.classSuffix = swaggerOpts.classSuffix;
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
                swaggerOpts.emitBarrel = true;
                mongooseOpts.emitBarrel = true;
                break;
            case "--dry-run":
                dryRun = true;
                break;
            default:
                console.warn(`Unknown option: ${args[i]}`);
        }
    }

    return { file, interfaceName, out, kind, swaggerOpts, mongooseOpts, dryRun };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { file, interfaceName, out, kind, swaggerOpts, mongooseOpts, dryRun } = parseArgs(process.argv);

    if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
    }

    const kindLabel = kind === "mongoose" ? "Mongoose Schemas" : "Swagger DTOs";
    console.log(`\n📦 Resolving "${interfaceName}" from ${file}...`);
    console.log(`   Generator: ${kindLabel}\n`);

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

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});