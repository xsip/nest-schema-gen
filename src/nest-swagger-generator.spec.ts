import { NestSwaggerGenerator } from './nest-swagger-generator';
import {
    ResolutionResult,
    ResolvedInterface,
    ResolvedDeclaration,
    ResolvedField,
    FieldType,
} from './resolver';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function field(
    name: string,
    type: FieldType,
    optional = false,
    docs?: string
): ResolvedField {
    return { name, type, optional, docs };
}

function iface(
    name: string,
    fields: ResolvedField[],
    sourcePath = ''
): ResolvedDeclaration & { kind: 'interface' } {
    return { kind: 'interface', name, fields, sourcePath };
}

function enumDecl(name: string): ResolvedDeclaration & { kind: 'enum' } {
    return {
        kind: 'enum',
        name,
        members: [{ name: 'A', value: 'a' }, { name: 'B', value: 'b' }],
        sourcePath: '',
    };
}

function makeResult(
    decls: ResolvedDeclaration[],
    rootName = decls[0]?.name ?? 'Root'
): ResolutionResult {
    const root = decls.find((d) => d.name === rootName && d.kind === 'interface') as ResolvedInterface | undefined;
    return {
        declarations: decls,
        root: root ?? { name: rootName, fields: [], sourcePath: '' },
    };
}

function generate(
    decls: ResolvedDeclaration[],
    rootName?: string,
    opts: ConstructorParameters<typeof NestSwaggerGenerator>[0] = {}
) {
    const result = makeResult(decls, rootName ?? decls[0]?.name);
    const gen = new NestSwaggerGenerator(opts);
    return gen.generate(result);
}

// ─── Basic generation ─────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – class structure', () => {
    it('generates a DTO class with default Dto suffix', () => {
        const decls = [iface('IUser', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.filename).toBe('UserDto.ts');
        expect(file.content).toContain('export class UserDto {');
    });

    it('respects a custom classSuffix', () => {
        const decls = [iface('IUser', [field('id', { kind: 'primitive', type: 'number' })])];
        const [file] = generate(decls, undefined, { classSuffix: 'Request' });
        expect(file.filename).toBe('UserRequest.ts');
        expect(file.content).toContain('export class UserRequest {');
    });

    it('supports legacy dtoSuffix option', () => {
        const decls = [iface('IOrder', [field('id', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls, undefined, { dtoSuffix: 'Data' } as any);
        expect(file.filename).toBe('OrderData.ts');
    });

    it('always imports ApiProperty from @nestjs/swagger', () => {
        const decls = [iface('IFoo', [field('x', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.content).toContain("from '@nestjs/swagger'");
        expect(file.content).toContain('ApiProperty');
    });
});

// ─── Primitive fields ─────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – primitive fields', () => {
    it.each([
        ['string', 'string', "@ApiProperty({ type: 'string' })", '@IsString()'],
        ['number', 'number', "@ApiProperty({ type: 'number' })", '@IsNumber()'],
        ['boolean', 'boolean', "@ApiProperty({ type: 'boolean' })", '@IsBoolean()'],
    ])('%s field gets @ApiProperty type and validator', (_, primType, apiProp, validator) => {
        const decls = [iface('IFoo', [field('val', { kind: 'primitive', type: primType as any })])];
        const [file] = generate(decls);
        expect(file.content).toContain(apiProp);
        expect(file.content).toContain(validator);
    });

    it('Date field gets @ApiProperty type: Date and @IsDate()', () => {
        const decls = [iface('IFoo', [field('createdAt', { kind: 'primitive', type: 'Date' })])];
        const [file] = generate(decls);
        expect(file.content).toContain('@ApiProperty({ type: Date })');
        expect(file.content).toContain('@IsDate()');
        expect(file.content).toContain('@Transform(');
    });

    it('any/unknown fields emit @ApiProperty() with no type', () => {
        const decls = [iface('IFoo', [field('meta', { kind: 'primitive', type: 'any' })])];
        const [file] = generate(decls);
        expect(file.content).toContain('@ApiProperty()');
    });
});

// ─── Optional fields ──────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – optional fields', () => {
    it('marks optional fields with required: false and @IsOptional()', () => {
        const decls = [
            iface('IFoo', [field('desc', { kind: 'primitive', type: 'string' }, true)]),
        ];
        const [file] = generate(decls);
        expect(file.content).toContain('required: false');
        expect(file.content).toContain('@IsOptional()');
        expect(file.content).toContain('desc?: string;');
    });

    it('required field uses ! assertion', () => {
        const decls = [iface('IFoo', [field('id', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls);
        expect(file.content).toContain('id!: string;');
    });
});

// ─── Enum fields ──────────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – enum fields', () => {
    it('emits enum: EnumName on @ApiProperty and @IsEnum()', () => {
        const decls: ResolvedDeclaration[] = [
            iface('IUser', [field('role', { kind: 'enum', name: 'UserRole' })]),
            enumDecl('UserRole'),
        ];
        const files = generate(decls, 'IUser');
        const dto = files.find((f) => f.filename === 'UserDto.ts')!;
        expect(dto.content).toContain('enum: UserRole');
        expect(dto.content).toContain('@IsEnum(UserRole)');
        // enum local import
        expect(dto.content).toContain("from './UserRole'");
    });
});

// ─── Reference fields ─────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – reference fields', () => {
    it('emits type: () => RefDto and @ValidateNested()', () => {
        const decls: ResolvedDeclaration[] = [
            iface('IOrder', [field('address', { kind: 'reference', name: 'IAddress' })]),
            iface('IAddress', [field('street', { kind: 'primitive', type: 'string' })]),
        ];
        const files = generate(decls, 'IOrder');
        const orderDto = files.find((f) => f.filename === 'OrderDto.ts')!;
        expect(orderDto.content).toContain('type: () => AddressDto');
        expect(orderDto.content).toContain('@ValidateNested()');
        expect(orderDto.content).toContain('@Type(() => AddressDto)');
    });

    it('imports the referenced DTO locally', () => {
        const decls: ResolvedDeclaration[] = [
            iface('IOrder', [field('address', { kind: 'reference', name: 'IAddress' })]),
            iface('IAddress', [field('street', { kind: 'primitive', type: 'string' })]),
        ];
        const files = generate(decls, 'IOrder');
        const orderDto = files.find((f) => f.filename === 'OrderDto.ts')!;
        expect(orderDto.content).toContain("from './AddressDto'");
    });
});

// ─── Array fields ─────────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – array fields', () => {
    it('emits isArray: true for string[] fields with @IsArray()', () => {
        const decls = [
            iface('IFoo', [field('tags', { kind: 'array', elementType: { kind: 'primitive', type: 'string' } })]),
        ];
        const [file] = generate(decls);
        expect(file.content).toContain('isArray: true');
        expect(file.content).toContain('@IsArray()');
        expect(file.content).toContain("type: 'string'");
    });

    it('emits @ValidateNested({ each: true }) for reference arrays', () => {
        const decls: ResolvedDeclaration[] = [
            iface('IList', [field('items', { kind: 'array', elementType: { kind: 'reference', name: 'IItem' } })]),
            iface('IItem', [field('id', { kind: 'primitive', type: 'string' })]),
        ];
        const files = generate(decls, 'IList');
        const listDto = files.find((f) => f.filename === 'ListDto.ts')!;
        expect(listDto.content).toContain('@ValidateNested({ each: true })');
    });
});

// ─── Union fields ──────────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – union fields', () => {
    it('handles literal union as enum with @IsIn()', () => {
        const type: FieldType = {
            kind: 'union',
            types: [
                { kind: 'literal', value: 'active' },
                { kind: 'literal', value: 'inactive' },
            ],
        };
        const decls = [iface('IFoo', [field('status', type)])];
        const [file] = generate(decls);
        expect(file.content).toContain("enum: ['active', 'inactive']");
        expect(file.content).toContain("@IsIn(['active', 'inactive'])");
    });

    it('handles union with null (optional-style union)', () => {
        const type: FieldType = {
            kind: 'union',
            types: [{ kind: 'primitive', type: 'string' }, { kind: 'primitive', type: 'null' }],
        };
        const decls = [iface('IFoo', [field('name', type)])];
        const [file] = generate(decls);
        // After stripping null, single member → collapse to string
        expect(file.content).toContain("type: 'string'");
    });

    it('emits oneOf for DTO unions and @ApiExtraModels', () => {
        const decls: ResolvedDeclaration[] = [
            iface('IPayload', [
                field('data', {
                    kind: 'union',
                    types: [
                        { kind: 'reference', name: 'IFoo' },
                        { kind: 'reference', name: 'IBar' },
                    ],
                }),
            ]),
            iface('IFoo', [field('x', { kind: 'primitive', type: 'string' })]),
            iface('IBar', [field('y', { kind: 'primitive', type: 'number' })]),
        ];
        const files = generate(decls, 'IPayload');
        const payloadDto = files.find((f) => f.filename === 'PayloadDto.ts')!;
        expect(payloadDto.content).toContain('ApiExtraModels');
        expect(payloadDto.content).toContain('oneOf');
        expect(payloadDto.content).toContain('getSchemaPath');
    });
});

// ─── Record fields ────────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – record fields', () => {
    it('emits type: object for Record fields', () => {
        const type: FieldType = {
            kind: 'record',
            keyType: { kind: 'primitive', type: 'string' },
            valueType: { kind: 'primitive', type: 'number' },
        };
        const decls = [iface('IFoo', [field('meta', type)])];
        const [file] = generate(decls);
        expect(file.content).toContain("type: 'object'");
    });
});

// ─── JSDoc ────────────────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – JSDoc', () => {
    it('emits single-line doc comment and description on @ApiProperty', () => {
        const decls = [
            iface('IFoo', [field('name', { kind: 'primitive', type: 'string' }, false, 'The user name')]),
        ];
        const [file] = generate(decls);
        expect(file.content).toContain('/** The user name */');
        expect(file.content).toContain('description: `The user name`');
    });

    it('emits multi-line doc comments with * prefix', () => {
        const decls = [
            iface('IFoo', [field('desc', { kind: 'primitive', type: 'string' }, false, 'Line 1\nLine 2')]),
        ];
        const [file] = generate(decls);
        expect(file.content).toContain(' * Line 1');
        expect(file.content).toContain(' * Line 2');
    });
});

// ─── classValidator / classTransformer toggle ─────────────────────────────────

describe('NestSwaggerGenerator – options toggles', () => {
    it('disables class-validator when classValidator=false', () => {
        const decls = [iface('IFoo', [field('name', { kind: 'primitive', type: 'string' })])];
        const [file] = generate(decls, undefined, { classValidator: false });
        expect(file.content).not.toContain('IsString');
        expect(file.content).not.toContain('class-validator');
    });

    it('disables class-transformer when classTransformer=false', () => {
        const decls: ResolvedDeclaration[] = [
            iface('IFoo', [field('addr', { kind: 'reference', name: 'IAddr' })]),
            iface('IAddr', [field('x', { kind: 'primitive', type: 'string' })]),
        ];
        const files = generate(decls, 'IFoo', { classTransformer: false });
        const fooDto = files.find((f) => f.filename === 'FooDto.ts')!;
        expect(fooDto.content).not.toContain('@Type(');
    });

    it('emits barrel when emitBarrel=true', () => {
        const decls = [iface('IFoo', [field('x', { kind: 'primitive', type: 'string' })])];
        const files = generate(decls, undefined, { emitBarrel: true });
        const barrel = files.find((f) => f.filename === 'index.ts');
        expect(barrel).toBeDefined();
        expect(barrel!.content).toContain("export * from './FooDto'");
    });
});

// ─── Literal fields ───────────────────────────────────────────────────────────

describe('NestSwaggerGenerator – literal fields', () => {
    it('string literal emits @Equals() validator', () => {
        const decls = [iface('IFoo', [field('type', { kind: 'literal', value: 'widget' })])];
        const [file] = generate(decls);
        expect(file.content).toContain("@Equals('widget')");
    });

    it('number literal emits @Equals() validator', () => {
        const decls = [iface('IFoo', [field('version', { kind: 'literal', value: 2 })])];
        const [file] = generate(decls);
        expect(file.content).toContain('@Equals(2)');
    });
});