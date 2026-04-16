"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_generator_1 = require("./base-generator");
// ─── Minimal concrete subclass for testing ────────────────────────────────────
class TestGenerator extends base_generator_1.BaseGenerator {
    constructor(opts = {}) {
        super(opts, { classSuffix: 'Dto', emitBarrel: false });
    }
    generateInterface(decl, result) {
        return { filename: `${this.toClassName(decl.name)}.ts`, content: `// ${decl.name}` };
    }
    // Expose protected helpers for testing
    exposedToClassName(name) { return this.toClassName(name); }
    exposedToTsType(type, result) { return this.toTsType(type, result); }
    exposedCollectUsedNames(type, out) { return this.collectUsedNames(type, out); }
    exposedCollectUnionDtoNames(type, out) { return this.collectUnionDtoNames(type, out); }
    exposedIsAllLiterals(types) { return this.isAllLiterals(types); }
    exposedBuildLiteralEnumExpr(types) { return this.buildLiteralEnumExpr(types); }
    exposedGenerateEnum(decl) { return this.generateEnum(decl); }
}
function makeResult(decls = []) {
    return {
        declarations: decls,
        root: { name: 'Root', fields: [], sourcePath: '' },
    };
}
// ─── ImportBuilder ────────────────────────────────────────────────────────────
describe('ImportBuilder', () => {
    it('renders a single external import', () => {
        const ib = new base_generator_1.ImportBuilder();
        ib.add('@nestjs/swagger', 'ApiProperty');
        expect(ib.render()).toBe("import { ApiProperty } from '@nestjs/swagger';");
    });
    it('renders multiple names sorted within one module', () => {
        const ib = new base_generator_1.ImportBuilder();
        ib.add('class-validator', 'IsString');
        ib.add('class-validator', 'IsNumber');
        ib.add('class-validator', 'IsBoolean');
        const rendered = ib.render();
        expect(rendered).toBe("import { IsBoolean, IsNumber, IsString } from 'class-validator';");
    });
    it('separates external and local imports with a blank line', () => {
        const ib = new base_generator_1.ImportBuilder();
        ib.add('@nestjs/swagger', 'ApiProperty');
        ib.addLocal('./UserDto', 'UserDto');
        const lines = ib.render().split('\n');
        expect(lines[0]).toContain('@nestjs/swagger');
        expect(lines[1]).toBe('');
        expect(lines[2]).toContain('./UserDto');
    });
    it('deduplicates names added twice', () => {
        const ib = new base_generator_1.ImportBuilder();
        ib.add('class-validator', 'IsString');
        ib.add('class-validator', 'IsString');
        expect(ib.render()).toBe("import { IsString } from 'class-validator';");
    });
    it('reserve() creates the slot but emits nothing when empty', () => {
        const ib = new base_generator_1.ImportBuilder();
        ib.reserve('class-validator');
        expect(ib.render()).toBe('');
    });
    it('renders nothing for a module with only a reserve and no adds', () => {
        const ib = new base_generator_1.ImportBuilder();
        ib.reserve('some-lib');
        ib.add('@nestjs/swagger', 'ApiProperty');
        const rendered = ib.render();
        expect(rendered).not.toContain('some-lib');
    });
    it('addLocal delegates to add', () => {
        const ib = new base_generator_1.ImportBuilder();
        ib.addLocal('./FooDto', 'FooDto');
        expect(ib.render()).toBe("import { FooDto } from './FooDto';");
    });
});
// ─── BaseGenerator: toClassName ───────────────────────────────────────────────
describe('BaseGenerator.toClassName', () => {
    let gen;
    beforeEach(() => { gen = new TestGenerator({ classSuffix: 'Dto' }); });
    it('strips leading I from PascalCase names', () => {
        expect(gen.exposedToClassName('IUser')).toBe('UserDto');
    });
    it('does not strip I from names where second letter is lowercase', () => {
        expect(gen.exposedToClassName('Input')).toBe('InputDto');
    });
    it('does not double-append the suffix', () => {
        expect(gen.exposedToClassName('UserDto')).toBe('UserDto');
    });
    it('appends suffix to plain names', () => {
        expect(gen.exposedToClassName('Address')).toBe('AddressDto');
    });
    it('respects a custom classSuffix', () => {
        const g = new TestGenerator({ classSuffix: 'Schema' });
        expect(g.exposedToClassName('IProfile')).toBe('ProfileSchema');
    });
});
// ─── BaseGenerator: toTsType ──────────────────────────────────────────────────
describe('BaseGenerator.toTsType', () => {
    let gen;
    const result = makeResult();
    beforeEach(() => { gen = new TestGenerator(); });
    it('handles primitive types', () => {
        expect(gen.exposedToTsType({ kind: 'primitive', type: 'string' }, result)).toBe('string');
        expect(gen.exposedToTsType({ kind: 'primitive', type: 'number' }, result)).toBe('number');
        expect(gen.exposedToTsType({ kind: 'primitive', type: 'boolean' }, result)).toBe('boolean');
        expect(gen.exposedToTsType({ kind: 'primitive', type: 'Date' }, result)).toBe('Date');
        expect(gen.exposedToTsType({ kind: 'primitive', type: 'any' }, result)).toBe('any');
    });
    it('handles string literal', () => {
        expect(gen.exposedToTsType({ kind: 'literal', value: 'admin' }, result)).toBe("'admin'");
    });
    it('handles number literal', () => {
        expect(gen.exposedToTsType({ kind: 'literal', value: 42 }, result)).toBe('42');
    });
    it('handles boolean literal', () => {
        expect(gen.exposedToTsType({ kind: 'literal', value: true }, result)).toBe('true');
    });
    it('handles array of primitives', () => {
        expect(gen.exposedToTsType({ kind: 'array', elementType: { kind: 'primitive', type: 'string' } }, result)).toBe('string[]');
    });
    it('wraps union element arrays in parens', () => {
        const type = {
            kind: 'array',
            elementType: {
                kind: 'union',
                types: [{ kind: 'primitive', type: 'string' }, { kind: 'primitive', type: 'number' }],
            },
        };
        expect(gen.exposedToTsType(type, result)).toBe('(string | number)[]');
    });
    it('handles reference type with className transform', () => {
        expect(gen.exposedToTsType({ kind: 'reference', name: 'IAddress' }, result)).toBe('AddressDto');
    });
    it('handles enum type', () => {
        expect(gen.exposedToTsType({ kind: 'enum', name: 'UserRole' }, result)).toBe('UserRole');
    });
    it('handles Record type', () => {
        const type = {
            kind: 'record',
            keyType: { kind: 'primitive', type: 'string' },
            valueType: { kind: 'primitive', type: 'number' },
        };
        expect(gen.exposedToTsType(type, result)).toBe('Record<string, number>');
    });
    it('handles union type', () => {
        const type = {
            kind: 'union',
            types: [{ kind: 'primitive', type: 'string' }, { kind: 'primitive', type: 'null' }],
        };
        expect(gen.exposedToTsType(type, result)).toBe('string | null');
    });
    it('falls back to any for unknown kind', () => {
        // @ts-expect-error intentionally invalid kind
        expect(gen.exposedToTsType({ kind: 'unknown_kind' }, result)).toBe('any');
    });
});
// ─── BaseGenerator: collectUsedNames ──────────────────────────────────────────
describe('BaseGenerator.collectUsedNames', () => {
    let gen;
    beforeEach(() => { gen = new TestGenerator(); });
    it('collects reference names', () => {
        const out = new Set();
        gen.exposedCollectUsedNames({ kind: 'reference', name: 'IUser' }, out);
        expect(out).toContain('IUser');
    });
    it('collects enum names', () => {
        const out = new Set();
        gen.exposedCollectUsedNames({ kind: 'enum', name: 'Role' }, out);
        expect(out).toContain('Role');
    });
    it('collects inside arrays', () => {
        const out = new Set();
        gen.exposedCollectUsedNames({ kind: 'array', elementType: { kind: 'reference', name: 'ITag' } }, out);
        expect(out).toContain('ITag');
    });
    it('collects inside records (key and value)', () => {
        const out = new Set();
        gen.exposedCollectUsedNames({
            kind: 'record',
            keyType: { kind: 'enum', name: 'KeyEnum' },
            valueType: { kind: 'reference', name: 'IValue' },
        }, out);
        expect(out).toContain('KeyEnum');
        expect(out).toContain('IValue');
    });
    it('collects inside unions', () => {
        const out = new Set();
        gen.exposedCollectUsedNames({
            kind: 'union',
            types: [{ kind: 'reference', name: 'IA' }, { kind: 'reference', name: 'IB' }],
        }, out);
        expect(out).toContain('IA');
        expect(out).toContain('IB');
    });
    it('ignores primitives and literals', () => {
        const out = new Set();
        gen.exposedCollectUsedNames({ kind: 'primitive', type: 'string' }, out);
        gen.exposedCollectUsedNames({ kind: 'literal', value: 'x' }, out);
        expect(out.size).toBe(0);
    });
});
// ─── BaseGenerator: collectUnionDtoNames ──────────────────────────────────────
describe('BaseGenerator.collectUnionDtoNames', () => {
    let gen;
    beforeEach(() => { gen = new TestGenerator(); });
    it('collects reference names from union', () => {
        const out = [];
        gen.exposedCollectUnionDtoNames({
            kind: 'union',
            types: [{ kind: 'reference', name: 'IFoo' }, { kind: 'reference', name: 'IBar' }],
        }, out);
        expect(out).toEqual(['IFoo', 'IBar']);
    });
    it('collects from array element unions', () => {
        const out = [];
        gen.exposedCollectUnionDtoNames({
            kind: 'array',
            elementType: {
                kind: 'union',
                types: [{ kind: 'reference', name: 'IItem' }],
            },
        }, out);
        expect(out).toContain('IItem');
    });
    it('ignores non-reference members in union', () => {
        const out = [];
        gen.exposedCollectUnionDtoNames({
            kind: 'union',
            types: [{ kind: 'primitive', type: 'string' }, { kind: 'reference', name: 'IFoo' }],
        }, out);
        expect(out).toEqual(['IFoo']);
    });
});
// ─── BaseGenerator: isAllLiterals / buildLiteralEnumExpr ──────────────────────
describe('BaseGenerator literal helpers', () => {
    let gen;
    beforeEach(() => { gen = new TestGenerator(); });
    it('isAllLiterals returns true for all-literal array', () => {
        expect(gen.exposedIsAllLiterals([
            { kind: 'literal', value: 'a' },
            { kind: 'literal', value: 'b' },
        ])).toBe(true);
    });
    it('isAllLiterals returns false for empty array', () => {
        expect(gen.exposedIsAllLiterals([])).toBe(false);
    });
    it('isAllLiterals returns false when any non-literal present', () => {
        expect(gen.exposedIsAllLiterals([
            { kind: 'literal', value: 'a' },
            { kind: 'primitive', type: 'string' },
        ])).toBe(false);
    });
    it('buildLiteralEnumExpr produces correct string array', () => {
        const result = gen.exposedBuildLiteralEnumExpr([
            { kind: 'literal', value: 'admin' },
            { kind: 'literal', value: 'user' },
        ]);
        expect(result).toBe("['admin', 'user']");
    });
    it('buildLiteralEnumExpr handles number literals', () => {
        const result = gen.exposedBuildLiteralEnumExpr([
            { kind: 'literal', value: 1 },
            { kind: 'literal', value: 2 },
        ]);
        expect(result).toBe('[1, 2]');
    });
});
// ─── BaseGenerator: generateEnum ──────────────────────────────────────────────
describe('BaseGenerator.generateEnum', () => {
    let gen;
    beforeEach(() => { gen = new TestGenerator(); });
    it('generates a TypeScript enum', () => {
        const file = gen.exposedGenerateEnum({
            name: 'UserRole',
            members: [
                { name: 'Admin', value: 'admin' },
                { name: 'User', value: 'user' },
            ],
            sourcePath: '',
        });
        expect(file.filename).toBe('UserRole.ts');
        expect(file.content).toContain('export enum UserRole {');
        expect(file.content).toContain("  Admin = 'admin',");
        expect(file.content).toContain("  User = 'user',");
    });
    it('handles numeric enum values', () => {
        const file = gen.exposedGenerateEnum({
            name: 'Status',
            members: [
                { name: 'Active', value: 1 },
                { name: 'Inactive', value: 0 },
            ],
            sourcePath: '',
        });
        expect(file.content).toContain('  Active = 1,');
        expect(file.content).toContain('  Inactive = 0,');
    });
});
// ─── BaseGenerator: generate() loop ──────────────────────────────────────────
describe('BaseGenerator.generate()', () => {
    let gen;
    beforeEach(() => { gen = new TestGenerator(); });
    const iface = (name) => ({
        kind: 'interface',
        name,
        fields: [],
        sourcePath: '',
    });
    const enumDecl = (name) => ({
        kind: 'enum',
        name,
        members: [{ name: 'A', value: 'a' }],
        sourcePath: '',
    });
    it('does NOT skip the root interface when roots is undefined', () => {
        // When roots is undefined, skipNames is empty → all decls emitted including Root
        const result = {
            declarations: [iface('Root'), iface('UserDto')],
            root: { name: 'Root', fields: [], sourcePath: '' },
        };
        const files = gen.generate(result);
        const names = files.map((f) => f.filename);
        expect(names).toContain('RootDto.ts');
        expect(names).toContain('UserDto.ts');
    });
    it('skips root.name when roots is set (union alias)', () => {
        // When roots is set, root.name is added to skipNames → root placeholder excluded
        const result = {
            declarations: [iface('A'), iface('B'), iface('Root')],
            root: { name: 'Root', fields: [], sourcePath: '' },
            roots: [{ name: 'A', fields: [], sourcePath: '' }],
        };
        const files = gen.generate(result);
        const names = files.map((f) => f.filename);
        expect(names).toContain('ADto.ts');
        expect(names).toContain('BDto.ts');
        expect(names).not.toContain('RootDto.ts');
    });
    it('emits barrel when emitBarrel=true', () => {
        const g = new TestGenerator({ emitBarrel: true });
        const result = {
            declarations: [iface('UserDto')],
            root: { name: 'UserDto', fields: [], sourcePath: '' },
        };
        const files = g.generate(result);
        const barrel = files.find((f) => f.filename === 'index.ts');
        expect(barrel).toBeDefined();
        expect(barrel.content).toContain("export * from './");
    });
    it('generates enum files via generateEnum', () => {
        const result = {
            declarations: [enumDecl('UserRole')],
            root: { name: 'Something', fields: [], sourcePath: '' },
        };
        const files = gen.generate(result);
        expect(files.find((f) => f.filename === 'UserRole.ts')).toBeDefined();
    });
});
