#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { TypeResolver } from "./resolver";
import { DtoGenerator, GeneratorOptions } from "./generator";

// ──────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ──────────────────────────────────────────────────────────────────────────────

function printUsage(): void {
    console.log(`
NestJS Swagger DTO Generator
─────────────────────────────
Usage:
  ts-node src/cli.ts <file> <InterfaceName> [options]

Arguments:
  file            Path to the TypeScript source file
  InterfaceName   Name of the interface or type alias to convert

Options:
  --out <dir>           Output directory (default: ./generated)
  --suffix <suffix>     DTO class suffix (default: Dto)
  --no-validator        Disable class-validator decorators
  --no-transformer      Disable class-transformer @Type decorators
  --barrel              Emit a barrel index.ts
  --dry-run             Print output to stdout instead of writing files

Examples:
  ts-node src/cli.ts src/types/user.ts IUser
  ts-node src/cli.ts src/types/user.ts IUser --out src/dto --suffix Dto
  ts-node src/cli.ts src/types/user.ts IUser --dry-run
`);
}

interface CliArgs {
    file: string;
    interfaceName: string;
    out: string;
    opts: GeneratorOptions;
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
    const opts: GeneratorOptions = {};

    for (let i = 2; i < args.length; i++) {
        switch (args[i]) {
            case "--out":
                out = args[++i];
                break;
            case "--suffix":
                opts.dtoSuffix = args[++i];
                break;
            case "--no-validator":
                opts.classValidator = false;
                break;
            case "--no-transformer":
                opts.classTransformer = false;
                break;
            case "--barrel":
                opts.emitBarrel = true;
                break;
            case "--dry-run":
                dryRun = true;
                break;
            default:
                console.warn(`Unknown option: ${args[i]}`);
        }
    }

    return { file, interfaceName, out, opts, dryRun };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { file, interfaceName, out, opts, dryRun } = parseArgs(process.argv);

    // Validate input file
    if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
    }

    console.log(`\n📦 Resolving "${interfaceName}" from ${file}...\n`);

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
        console.log(
            `   Declarations: ${emitted.map((d) => d.name).join(", ")}\n`
        );
    }

    const generator = new DtoGenerator(opts);
    const files = generator.generate(result);

    if (dryRun) {
        for (const file of files) {
            console.log(`${"─".repeat(60)}`);
            console.log(`// ${file.filename}`);
            console.log(`${"─".repeat(60)}`);
            console.log(file.content);
        }
        return;
    }

    // Write files
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