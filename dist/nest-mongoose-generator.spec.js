"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const nest_mongoose_generator_1 = require("./nest-mongoose-generator");
// ─── Helpers ──────────────────────────────────────────────────────────────────
function field(name, type, optional = false, docs) {
    return { name, type, optional, docs };
}
function iface(name, fields) {
    return { kind: 'interface', name, fields, sourcePath: '' };
}
function enumDecl(name) {
    return {
        kind: 'enum',
        name,
        members: [{ name: 'A', value: 'a' }],
        sourcePath: '',
    };
}
function makeResult(decls, rootName) {
    const root = decls.find((d) => d.name === rootName && d.kind === 'interface');
    return {
        declarations: decls,
        root: root ?? { name: rootName ?? decls[0]?.name ?? 'Root', fields: [], sourcePath: '' },
    };
}
function generate(decls, rootName, opts = {}) {
    const result = makeResult(decls, rootName ?? decls[0]?.name);
    return new nest_mongoose_generator_1.NestMongooseGenerator(opts).generate(result);
}
// ─── Class structure ──────────────────────────────────────────────────────────
describe('NestMongooseGenerator – class structure', () => {
    it('generates a Schema class with default Schema suffix', () => {
        const decls = [iface('IUser', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.filename).toBe('UserSchema.ts');
        expect(file.content).toContain('export class UserSchema {');
    });
    it('emits @Schema({ timestamps: true }) by default', () => {
        const decls = [iface('IUser', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.content).toContain('@Schema({ timestamps: true })');
    });
    it('disables timestamps when timestamps=false', () => {
        const decls = [iface('IUser', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls, undefined, { timestamps: false });
        expect(file.content).toContain('@Schema()');
        expect(file.content).not.toContain('timestamps: true');
    });
    it('emits SchemaFactory.createForClass line', () => {
        const decls = [iface('IUser', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.content).toContain('SchemaFactory.createForClass(UserSchema)');
        expect(file.content).toContain('export const UserSchemaSchema =');
    });
    it('imports Prop, Schema, SchemaFactory from @nestjs/mongoose', () => {
        const decls = [iface('IFoo', [field('x', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.content).toContain("from '@nestjs/mongoose'");
        expect(file.content).toContain('Prop');
        expect(file.content).toContain('Schema');
        expect(file.content).toContain('SchemaFactory');
    });
    it('respects custom classSuffix', () => {
        const decls = [iface('IUser', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls, undefined, { classSuffix: 'Document' });
        expect(file.filename).toBe('UserDocument.ts');
    });
});
// ─── Primitive @Prop ──────────────────────────────────────────────────────────
describe('NestMongooseGenerator – primitive @Prop types', () => {
    it.each([
        ['string', 'type: String'],
        ['number', 'type: Number'],
        ['boolean', 'type: Boolean'],
        ['Date', 'type: Date'],
    ])('%s maps to Mongoose %s', (prim, expected) => {
        const decls = [iface('IFoo', [field('val', { kind: 'primitive', type: prim })])];
        const [file] = generate(decls);
        expect(file.content).toContain(expected);
    });
    it('any/unknown maps to mongoose.Schema.Types.Mixed', () => {
        const decls = [iface('IFoo', [field('meta', { kind: 'primitive', type: 'any' })])];
        const [file] = generate(decls);
        expect(file.content).toContain('mongoose.Schema.Types.Mixed');
    });
});
// ─── Required vs optional ─────────────────────────────────────────────────────
describe('NestMongooseGenerator – required/optional', () => {
    it('required field emits required: true in @Prop', () => {
        const decls = [iface('IFoo', [field('name', { kind: 'primitive', type: 'string' }, false)])];
        const [file] = generate(decls);
        expect(file.content).toContain('required: true');
        expect(file.content).toContain('name!: string;');
    });
    it('optional field does NOT emit required: true', () => {
        const decls = [iface('IFoo', [field('nick', { kind: 'primitive', type: 'string' }, true)])];
        const [file] = generate(decls);
        expect(file.content).not.toContain('required: true');
        expect(file.content).toContain('nick?: string;');
    });
});
// ─── Enum @Prop ───────────────────────────────────────────────────────────────
describe('NestMongooseGenerator – enum @Prop', () => {
    it('emits enum: EnumName on @Prop and imports enum', () => {
        const decls = [
            iface('IUser', [field('role', { kind: 'enum', name: 'UserRole' })]),
            enumDecl('UserRole'),
        ];
        const files = generate(decls, 'IUser');
        const schemaFile = files.find((f) => f.filename === 'UserSchema.ts');
        expect(schemaFile.content).toContain('enum: UserRole');
        expect(schemaFile.content).toContain("from './UserRole'");
    });
});
// ─── Reference @Prop ─────────────────────────────────────────────────────────
describe('NestMongooseGenerator – reference @Prop', () => {
    it('emits type: NestedSchema for embedded sub-documents', () => {
        const decls = [
            iface('IOrder', [field('address', { kind: 'reference', name: 'IAddress' })]),
            iface('IAddress', [field('street', { kind: 'primitive', type: 'string' })]),
        ];
        const files = generate(decls, 'IOrder');
        const orderSchema = files.find((f) => f.filename === 'OrderSchema.ts');
        expect(orderSchema.content).toContain('type: AddressSchema');
    });
});
// ─── Array @Prop ──────────────────────────────────────────────────────────────
describe('NestMongooseGenerator – array @Prop', () => {
    it('emits [String] type for string[] fields', () => {
        const decls = [
            iface('IFoo', [field('tags', { kind: 'array', elementType: { kind: 'primitive', type: 'string' } })]),
        ];
        const [file] = generate(decls);
        expect(file.content).toContain('type: [String]');
    });
    it('emits sub-document array with type: [RefSchema]', () => {
        const decls = [
            iface('IList', [field('items', { kind: 'array', elementType: { kind: 'reference', name: 'IItem' } })]),
            iface('IItem', [field('id', { kind: 'primitive', type: 'string' })]),
        ];
        const files = generate(decls, 'IList');
        const listSchema = files.find((f) => f.filename === 'ListSchema.ts');
        expect(listSchema.content).toContain('type: [ItemSchema]');
    });
    it('emits Mixed for array of union', () => {
        const type = {
            kind: 'array',
            elementType: {
                kind: 'union',
                types: [
                    { kind: 'primitive', type: 'string' },
                    { kind: 'primitive', type: 'number' },
                ],
            },
        };
        const decls = [iface('IFoo', [field('mixed', type)])];
        const [file] = generate(decls);
        expect(file.content).toContain('mongoose.Schema.Types.Mixed');
    });
});
// ─── Record @Prop ─────────────────────────────────────────────────────────────
describe('NestMongooseGenerator – record @Prop', () => {
    it('emits type: Map for Record fields', () => {
        const type = {
            kind: 'record',
            keyType: { kind: 'primitive', type: 'string' },
            valueType: { kind: 'primitive', type: 'number' },
        };
        const decls = [iface('IFoo', [field('data', type)])];
        const [file] = generate(decls);
        expect(file.content).toContain('type: Map');
    });
});
// ─── Union @Prop ──────────────────────────────────────────────────────────────
describe('NestMongooseGenerator – union @Prop', () => {
    it('collapses string|null to single String type', () => {
        const type = {
            kind: 'union',
            types: [{ kind: 'primitive', type: 'string' }, { kind: 'primitive', type: 'null' }],
        };
        const decls = [iface('IFoo', [field('name', type)])];
        const [file] = generate(decls);
        expect(file.content).toContain('type: String');
    });
    it('literal union becomes enum', () => {
        const type = {
            kind: 'union',
            types: [{ kind: 'literal', value: 'active' }, { kind: 'literal', value: 'inactive' }],
        };
        const decls = [iface('IFoo', [field('status', type)])];
        const [file] = generate(decls);
        expect(file.content).toContain("enum: ['active', 'inactive']");
    });
    it('mixed type union falls back to Mixed', () => {
        const type = {
            kind: 'union',
            types: [
                { kind: 'primitive', type: 'string' },
                { kind: 'primitive', type: 'number' },
            ],
        };
        const decls = [iface('IFoo', [field('value', type)])];
        const [file] = generate(decls);
        expect(file.content).toContain('mongoose.Schema.Types.Mixed');
    });
});
// ─── Lean interface ───────────────────────────────────────────────────────────
describe('NestMongooseGenerator – emitInterface', () => {
    it('does not emit interface by default', () => {
        const decls = [iface('IUser', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.content).not.toContain('export interface');
    });
    it('emits a lean interface when emitInterface=true', () => {
        const decls = [
            iface('IUser', [
                field('name', { kind: 'primitive', type: 'string' }),
                field('age', { kind: 'primitive', type: 'number' }, true),
            ]),
        ];
        const [file] = generate(decls, undefined, { emitInterface: true });
        expect(file.content).toContain('export interface IUser {');
        expect(file.content).toContain('name: string;');
        expect(file.content).toContain('age?: number;');
    });
});
// ─── JSDoc ────────────────────────────────────────────────────────────────────
describe('NestMongooseGenerator – JSDoc', () => {
    it('emits single-line doc comments', () => {
        const decls = [
            iface('IFoo', [field('name', { kind: 'primitive', type: 'string' }, false, 'User name')]),
        ];
        const [file] = generate(decls);
        expect(file.content).toContain('/** User name */');
    });
    it('emits multi-line doc comments', () => {
        const decls = [
            iface('IFoo', [field('desc', { kind: 'primitive', type: 'string' }, false, 'Line 1\nLine 2')]),
        ];
        const [file] = generate(decls);
        expect(file.content).toContain(' * Line 1');
        expect(file.content).toContain(' * Line 2');
    });
});
// ─── Barrel ───────────────────────────────────────────────────────────────────
describe('NestMongooseGenerator – barrel', () => {
    it('emits barrel index.ts when emitBarrel=true', () => {
        const decls = [iface('IFoo', [field('x', { kind: 'primitive', type: 'string' })])];
        const files = generate(decls, undefined, { emitBarrel: true });
        const barrel = files.find((f) => f.filename === 'index.ts');
        expect(barrel).toBeDefined();
        expect(barrel.content).toContain("export * from './FooSchema'");
    });
});
