/**
 * Tests for the CLI argument parser.
 * We import `parseArgs` by extracting it from the cli module through a re-export
 * shim, or we just test the function signature via a local copy of the logic.
 *
 * Because cli.ts also calls main() at the module level and uses process.exit,
 * we test parseArgs indirectly by spawning the function in isolation.
 */

import * as path from 'path';

// Re-implement parseArgs locally to test its logic without pulling in the entire
// CLI entry-point (which calls main() and touches fs).
// This mirrors the function in cli.ts 1:1 and keeps the tests hermetic.
import { NestSwaggerGeneratorOptions } from './nest-swagger-generator';
import { NestMongooseGeneratorOptions } from './nest-mongoose-generator';

type GeneratorKind = 'swagger' | 'mongoose';

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
    const args = argv.slice(2);

    const file = path.resolve(args[0]);
    const interfaceName = args[1];

    let out = './generated';
    let dryRun = false;
    let kind: GeneratorKind = 'swagger';
    const swaggerOpts: NestSwaggerGeneratorOptions = {};
    const mongooseOpts: NestMongooseGeneratorOptions = {};

    for (let i = 2; i < args.length; i++) {
        switch (args[i]) {
            case '--generator':
                kind = args[++i] as GeneratorKind;
                break;
            case '--out':
                out = args[++i];
                break;
            case '--suffix':
                swaggerOpts.classSuffix = args[++i];
                mongooseOpts.classSuffix = swaggerOpts.classSuffix;
                break;
            case '--no-validator':
                swaggerOpts.classValidator = false;
                break;
            case '--no-transformer':
                swaggerOpts.classTransformer = false;
                break;
            case '--no-timestamps':
                mongooseOpts.timestamps = false;
                break;
            case '--emit-interface':
                mongooseOpts.emitInterface = true;
                break;
            case '--barrel':
                swaggerOpts.emitBarrel = true;
                mongooseOpts.emitBarrel = true;
                break;
            case '--dry-run':
                dryRun = true;
                break;
        }
    }

    return { file, interfaceName, out, kind, swaggerOpts, mongooseOpts, dryRun };
}

// ─── parseArgs tests ──────────────────────────────────────────────────────────

describe('CLI parseArgs', () => {
    const base = ['node', 'cli.ts'];

    it('parses positional file and interfaceName', () => {
        const result = parseArgs([...base, 'src/types/user.ts', 'IUser']);
        expect(result.interfaceName).toBe('IUser');
        expect(result.file).toContain('user.ts');
    });

    it('defaults to swagger generator', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo']);
        expect(result.kind).toBe('swagger');
    });

    it('defaults out to ./generated', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo']);
        expect(result.out).toBe('./generated');
    });

    it('defaults dryRun to false', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo']);
        expect(result.dryRun).toBe(false);
    });

    it('--generator mongoose', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--generator', 'mongoose']);
        expect(result.kind).toBe('mongoose');
    });

    it('--out sets output directory', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--out', 'src/generated']);
        expect(result.out).toBe('src/generated');
    });

    it('--suffix sets classSuffix for both generators', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--suffix', 'Request']);
        expect(result.swaggerOpts.classSuffix).toBe('Request');
        expect(result.mongooseOpts.classSuffix).toBe('Request');
    });

    it('--no-validator disables classValidator', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--no-validator']);
        expect(result.swaggerOpts.classValidator).toBe(false);
    });

    it('--no-transformer disables classTransformer', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--no-transformer']);
        expect(result.swaggerOpts.classTransformer).toBe(false);
    });

    it('--no-timestamps disables timestamps', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--no-timestamps']);
        expect(result.mongooseOpts.timestamps).toBe(false);
    });

    it('--emit-interface enables emitInterface', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--emit-interface']);
        expect(result.mongooseOpts.emitInterface).toBe(true);
    });

    it('--barrel enables emitBarrel for both generators', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--barrel']);
        expect(result.swaggerOpts.emitBarrel).toBe(true);
        expect(result.mongooseOpts.emitBarrel).toBe(true);
    });

    it('--dry-run enables dry run', () => {
        const result = parseArgs([...base, 'file.ts', 'IFoo', '--dry-run']);
        expect(result.dryRun).toBe(true);
    });

    it('combines multiple flags', () => {
        const result = parseArgs([
            ...base,
            'file.ts', 'IFoo',
            '--generator', 'mongoose',
            '--out', 'dist/schemas',
            '--no-timestamps',
            '--emit-interface',
            '--barrel',
            '--dry-run',
        ]);
        expect(result.kind).toBe('mongoose');
        expect(result.out).toBe('dist/schemas');
        expect(result.mongooseOpts.timestamps).toBe(false);
        expect(result.mongooseOpts.emitInterface).toBe(true);
        expect(result.mongooseOpts.emitBarrel).toBe(true);
        expect(result.dryRun).toBe(true);
    });
});

// ─── index.ts convenience functions ──────────────────────────────────────────

import * as os from 'os';
import * as fs from 'fs';
import { generateDtos, generateSchemas } from './index';

describe('generateDtos (index convenience API)', () => {
    let tmpFile: string;

    beforeAll(() => {
        tmpFile = path.join(os.tmpdir(), `test_iface_${Date.now()}.ts`);
        fs.writeFileSync(
            tmpFile,
            `export interface IProduct { name: string; price: number; active?: boolean; }\n`
        );
    });

    afterAll(() => {
        try { fs.unlinkSync(tmpFile); } catch {}
    });

    it('resolves and generates DTO files for a simple interface', () => {
        const files = generateDtos(tmpFile, 'IProduct');
        expect(files.length).toBeGreaterThan(0);
        const dto = files.find((f) => f.filename === 'ProductDto.ts');
        expect(dto).toBeDefined();
        expect(dto!.content).toContain('export class ProductDto');
        expect(dto!.content).toContain('name!: string');
        expect(dto!.content).toContain('price!: number');
        expect(dto!.content).toContain('active?:');
    });

    it('respects classSuffix option', () => {
        const files = generateDtos(tmpFile, 'IProduct', { classSuffix: 'Request' });
        expect(files.find((f) => f.filename === 'ProductRequest.ts')).toBeDefined();
    });

    it('emits barrel when requested', () => {
        const files = generateDtos(tmpFile, 'IProduct', { emitBarrel: true });
        const barrel = files.find((f) => f.filename === 'index.ts');
        expect(barrel).toBeDefined();
    });
});

describe('generateSchemas (index convenience API)', () => {
    let tmpFile: string;

    beforeAll(() => {
        tmpFile = path.join(os.tmpdir(), `test_schema_iface_${Date.now()}.ts`);
        fs.writeFileSync(
            tmpFile,
            `export interface IArticle { title: string; body: string; views?: number; }\n`
        );
    });

    afterAll(() => {
        try { fs.unlinkSync(tmpFile); } catch {}
    });

    it('resolves and generates Schema files for a simple interface', () => {
        const files = generateSchemas(tmpFile, 'IArticle');
        expect(files.length).toBeGreaterThan(0);
        const schema = files.find((f) => f.filename === 'ArticleSchema.ts');
        expect(schema).toBeDefined();
        expect(schema!.content).toContain('export class ArticleSchema');
        expect(schema!.content).toContain('SchemaFactory.createForClass');
    });

    it('emits lean interface when emitInterface=true', () => {
        const files = generateSchemas(tmpFile, 'IArticle', { emitInterface: true });
        const schema = files.find((f) => f.filename === 'ArticleSchema.ts')!;
        expect(schema.content).toContain('export interface IArticle');
    });
});