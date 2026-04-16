#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const resolver_1 = require("./resolver");
const nest_swagger_generator_1 = require("./nest-swagger-generator");
const nest_mongoose_generator_1 = require("./nest-mongoose-generator");
const zod_generator_1 = require("./zod-generator");
function printUsage() {
    console.log(`
NestJS Schema Generator
────────────────────────
Usage:
  ts-node src/cli.ts <file> <InterfaceName> [options]

Arguments:
  file            Path to the TypeScript source file
  InterfaceName   Name of the interface or type alias to convert

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
  --barrel              Emit a barrel index.ts
  --dry-run             Print output to stdout instead of writing files

Examples:
  ts-node src/cli.ts src/types/user.ts IUser
  ts-node src/cli.ts src/types/user.ts IUser --generator mongoose --out src/schemas
  ts-node src/cli.ts src/types/user.ts IUser --dry-run
`);
}
function parseArgs(argv) {
    const args = argv.slice(2); // strip node + script
    if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
        printUsage();
        process.exit(0);
    }
    const file = path.resolve(args[0]);
    const interfaceName = args[1];
    let out = "./generated";
    let dryRun = false;
    let kind = "swagger";
    const swaggerOpts = {};
    const mongooseOpts = {};
    const zodOpts = {};
    for (let i = 2; i < args.length; i++) {
        switch (args[i]) {
            case "--generator":
                kind = args[++i];
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
                swaggerOpts.emitBarrel = true;
                mongooseOpts.emitBarrel = true;
                zodOpts.emitBarrel = true;
                break;
            case "--dry-run":
                dryRun = true;
                break;
            default:
                console.warn(`Unknown option: ${args[i]}`);
        }
    }
    return { file, interfaceName, out, kind, swaggerOpts, mongooseOpts, zodOpts, dryRun };
}
// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
    const { file, interfaceName, out, kind, swaggerOpts, mongooseOpts, zodOpts, dryRun } = parseArgs(process.argv);
    if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
    }
    const kindLabel = kind === "mongoose" ? "Mongoose Schemas" : kind === "zod" ? "Zod Schemas" : "Swagger DTOs";
    console.log(`\n📦 Resolving "${interfaceName}" from ${file}...`);
    console.log(`   Generator: ${kindLabel}\n`);
    const resolver = new resolver_1.TypeResolver(file);
    let result;
    try {
        result = resolver.resolve(interfaceName);
    }
    catch (err) {
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
        console.log(`✅ Union alias with ${result.roots.length} member(s)`);
        console.log(`   Members: ${result.roots.map((r) => r.name).join(", ")}\n`);
        console.log(`   Total resolved: ${stats.interfaces} interface(s), ${stats.enums} enum(s)\n`);
    }
    else {
        console.log(`✅ Resolved ${stats.interfaces} interface(s), ${stats.enums} enum(s)`);
        console.log(`   Declarations: ${emitted.map((d) => d.name).join(", ")}\n`);
    }
    let files;
    if (kind === "mongoose") {
        files = new nest_mongoose_generator_1.NestMongooseGenerator(mongooseOpts).generate(result);
    }
    else if (kind === "zod") {
        files = new zod_generator_1.ZodGenerator(zodOpts).generate(result);
    }
    else {
        files = new nest_swagger_generator_1.NestSwaggerGenerator(swaggerOpts).generate(result);
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
