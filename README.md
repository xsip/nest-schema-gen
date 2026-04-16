# nest-schema-gen

> TypeScript interface → NestJS boilerplate, instantly.

`nest-schema-gen` reads your TypeScript interfaces and type aliases and generates fully-decorated **Swagger DTOs** (`@nestjs/swagger` + `class-validator`), **Mongoose schemas** (`@nestjs/mongoose`), and **Zod schemas** (`zod`) — eliminating the hand-written boilerplate that lives between your domain types and your API/database layers.

---

![Header](https://raw.githubusercontent.com/xsip/nest-schema-gen/refs/heads/main/preview.png)

---

## Features

- **Swagger DTO generation** — `@ApiProperty`, `@IsString`, `@IsOptional`, `@IsArray`, `@Type`, etc.
- **Mongoose schema generation** — `@Schema`, `@Prop`, `SchemaFactory`, inline union types
- **Zod schema generation** — `z.object`, `z.enum`, `z.union`, `z.array`, `z.record`, nullable/optional handling, and inferred TypeScript types
- **Deep type resolution** — follows `import`s, resolves generics, handles enums, unions, intersections, and nested interfaces
- **Folder mode** — recursively scan an entire directory and generate schemas for every exported interface, mirroring the source folder structure
- **Barrel file emission** — optional `index.ts` re-exporting all generated files
- **Dry-run mode** — preview output in the terminal without writing files
- **Programmatic API** — use `generateDtos` / `generateSchemas` / `generateZodSchemas` (single file) or the `*FromFolder` variants (whole directory) directly in Node scripts

---

## Installation

### Global (CLI use)

```bash
# directly from GitHub ( no npm release yet )
npm install -g github:xsip/nest-schema-gen
```

### Local (programmatic use)

```bash
npm install --save-dev nest-schema-gen
```

---

## CLI Usage

### Single file

```
nest-schema-gen <file> <InterfaceName> [options]
```

| Argument        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `file`          | Path to the TypeScript source file                   |
| `InterfaceName` | Name of the interface or type alias to convert       |

### Folder mode

```
nest-schema-gen --folder <dir> [options]
```

Recursively walks `<dir>`, finds every `.ts` file (excluding `.d.ts`), and generates schemas for **all exported interfaces and type aliases** in each file. The output directory mirrors the source folder structure — e.g. `src/user/user.types.ts` generates into `<out>/user/`.

| Argument         | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| `--folder <dir>` | Root directory to scan recursively                              |

### Options

| Flag                   | Description                                              | Default       |
| ---------------------- | -------------------------------------------------------- | ------------- |
| `--generator <kind>`   | Generator to use: `swagger` \| `mongoose` \| `zod`       | `swagger`     |
| `--out <dir>`          | Output directory                                         | `./generated` |
| `--suffix <suffix>`    | Class/const name suffix                                  | `Dto` / `""`  |
| `--barrel`             | Emit a barrel `index.ts` *(single-file mode only)*       | off           |
| `--dry-run`            | Print generated files to stdout, skip writing            | off           |
| `--ignore <patterns>`  | *(folder mode)* Comma-separated substrings to exclude    | —             |
| `--no-validator`       | *(swagger)* Disable `class-validator` decorators         | on            |
| `--no-transformer`     | *(swagger)* Disable `@Type` decorators                   | on            |
| `--no-timestamps`      | *(mongoose)* Disable `{ timestamps: true }` on `@Schema` | on            |
| `--emit-interface`     | *(mongoose)* Emit a companion lean document interface    | off           |
| `--schema-suffix`      | *(zod)* Suffix for the Zod schema const name             | `Schema`      |
| `--no-type`            | *(zod)* Skip emitting inferred TypeScript types          | on            |
| `--strict`             | *(zod)* Add `.strict()` to object schemas                | off           |

### Examples

```bash
# Generate a Swagger DTO
nest-schema-gen src/types/user.ts IUser

# Generate a Mongoose schema in a specific output directory
nest-schema-gen src/types/user.ts IUser --generator mongoose --out src/schemas

# Generate Zod schemas
nest-schema-gen src/types/user.ts IUser --generator zod --out src/schemas

# Generate strict Zod schemas without inferred types
nest-schema-gen src/types/user.ts IUser --generator zod --strict --no-type

# Preview output without writing files
nest-schema-gen src/types/user.ts IUser --dry-run

# Emit a barrel index.ts alongside the generated files
nest-schema-gen src/types/user.ts IUser --barrel --out src/dto

# Generate Zod schemas for every interface in a folder
nest-schema-gen --folder src/types --generator zod --out generated/zod

# Generate Mongoose schemas for a folder, previewing without writing
nest-schema-gen --folder src/types --generator mongoose --dry-run

# Scan a folder but skip test files and build artefacts
nest-schema-gen --folder src --ignore node_modules,dist,spec.ts
```

---

## Example

**Input** (`src/types/user.ts`):

```typescript
export enum Roles {
  /** Standard user with basic access permissions */
  USER = 'user',

  /** Administrator with elevated privileges */
  ADMIN = 'admin',
}

export interface UserDetails {
  /** User's first name */
  firstname: string;

  /** User's last name */
  lastname: string;

  /** Optional physical address of the user */
  address?: string;
}

export interface IUser {
  /** Unique username used for login or identification */
  username: string;

  /** Nested object containing personal details of the user */
  details: UserDetails;

  /** User's email address for contact and authentication */
  email: string;

  /** User's password (should be stored securely, e.g., hashed) */
  password: string;

  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  roles?: Array<Roles>;

  /** Array of inline role identifiers with limited predefined values */
  inlineRoles: ('test1' | 'test2' | 'test3')[];
}
```

**Swagger DTO output** (`--generator swagger`):

```typescript
// UserDto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { UserDetailsDto } from './UserDetailsDto';
import { Roles } from './Roles';

export class UserDto {
  /** Unique username used for login or identification */
  @ApiProperty({
    description: `Unique username used for login or identification`,
    type: 'string',
  })
  @IsString()
  username!: string;

  /** Nested object containing personal details of the user */
  @ApiProperty({
    description: `Nested object containing personal details of the user`,
    type: () => UserDetailsDto,
  })
  @ValidateNested()
  @Type(() => UserDetailsDto)
  details!: UserDetailsDto;

  /** User's email address for contact and authentication */
  @ApiProperty({
    description: `User's email address for contact and authentication`,
    type: 'string',
  })
  @IsString()
  email!: string;

  /** User's password (should be stored securely, e.g., hashed) */
  @ApiProperty({
    description: `User's password (should be stored securely, e.g., hashed)`,
    type: 'string',
  })
  @IsString()
  password!: string;

  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  @ApiProperty({
    required: false,
    description: `Optional list of roles assigned to the user (e.g., USER, ADMIN)`,
    isArray: true,
    enum: Roles,
  })
  @IsOptional()
  @IsArray()
  roles?: Roles[];

  /** Array of inline role identifiers with limited predefined values */
  @ApiProperty({
    description: `Array of inline role identifiers with limited predefined values`,
    isArray: true,
    enum: ['test1', 'test2', 'test3'],
  })
  @IsArray()
  inlineRoles!: ('test1' | 'test2' | 'test3')[];
}

// UserDetailsDto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UserDetailsDto {
  /** User's first name */
  @ApiProperty({
    description: `User's first name`,
    type: 'string',
  })
  @IsString()
  firstname!: string;

  /** User's last name */
  @ApiProperty({
    description: `User's last name`,
    type: 'string',
  })
  @IsString()
  lastname!: string;

  /** Optional physical address of the user */
  @ApiProperty({
    required: false,
    description: `Optional physical address of the user`,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  address?: string;
}

// Roles.ts
export enum Roles {
  USER = 'user',
  ADMIN = 'admin',
}
```

**Mongoose schema output** (`--generator mongoose`):

```typescript
// User.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

import { UserDetails } from './UserDetails';
import { Roles } from './Roles';

@Schema({ timestamps: true })
export class User {
  /** Unique username used for login or identification */
  @Prop({
    required: true,
    type: String,
  })
  username!: string;

  /** Nested object containing personal details of the user */
  @Prop({
    required: true,
    type: UserDetails,
  })
  details!: UserDetails;

  /** User's email address for contact and authentication */
  @Prop({
    required: true,
    type: String,
  })
  email!: string;

  /** User's password (should be stored securely, e.g., hashed) */
  @Prop({
    required: true,
    type: String,
  })
  password!: string;

  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  @Prop({
    type: String,
    enum: Roles,
  })
  roles?: Roles[];

  /** Array of inline role identifiers with limited predefined values */
  @Prop({
    required: true,
    type: mongoose.Schema.Types.Mixed,
  })
  inlineRoles!: ('test1' | 'test2' | 'test3')[];
}

export const UserSchema = SchemaFactory.createForClass(User);

// UserDetails.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class UserDetails {
  /** User's first name */
  @Prop({
    required: true,
    type: String,
  })
  firstname!: string;

  /** User's last name */
  @Prop({
    required: true,
    type: String,
  })
  lastname!: string;

  /** Optional physical address of the user */
  @Prop({ type: String })
  address?: string;
}

export const UserDetailsSchema = SchemaFactory.createForClass(UserDetails);

// Roles.ts
export enum Roles {
  USER = 'user',
  ADMIN = 'admin',
}
```

**Zod schema output** (`--generator zod`):

```typescript
// IUser.ts
import { z } from 'zod';
import { UserDetailsSchema } from './UserDetails';
import { RolesSchema } from './Roles';

export const IUserSchema = z.object({
  /** Unique username used for login or identification */
  username: z.string(),
  /** Nested object containing personal details of the user */
  details: UserDetailsSchema,
  /** User's email address for contact and authentication */
  email: z.string(),
  /** User's password (should be stored securely, e.g., hashed) */
  password: z.string(),
  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  roles: z.array(RolesSchema).optional(),
  /** Array of inline role identifiers with limited predefined values */
  inlineRoles: z.array(z.enum(['test1', 'test2', 'test3'])),
});

export type IUser = z.infer<typeof IUserSchema>;

// UserDetails.ts
import { z } from 'zod';

export const UserDetailsSchema = z.object({
  /** User's first name */
  firstname: z.string(),
  /** User's last name */
  lastname: z.string(),
  /** Optional physical address of the user */
  address: z.string().optional(),
});

export type UserDetails = z.infer<typeof UserDetailsSchema>;

// Roles.ts
import { z } from 'zod';

export enum Roles {
  USER = 'user',
  ADMIN = 'admin',
}

export const RolesSchema = z.nativeEnum(Roles);

export type RolesType = z.infer<typeof RolesSchema>;
```

---

## Programmatic API

### Single file

```typescript
import { generateDtos, generateSchemas, generateZodSchemas } from "nest-schema-gen";
import * as fs from "fs";
import * as path from "path";

// Generate Swagger DTOs
const dtoFiles = generateDtos("./src/types/user.ts", "IUser", {
  classSuffix: "Dto",
  emitBarrel: true,
});

for (const file of dtoFiles) {
  fs.writeFileSync(path.join("./src/dto", file.filename), file.content);
}

// Generate Mongoose schemas
const schemaFiles = generateSchemas("./src/types/user.ts", "IUser", {
  timestamps: true,
  emitInterface: true,
});

for (const file of schemaFiles) {
  fs.writeFileSync(path.join("./src/schemas", file.filename), file.content);
}

// Generate Zod schemas
const zodFiles = generateZodSchemas("./src/types/user.ts", "IUser", {
  emitType: true,
  strict: false,
  schemaSuffix: "Schema",
});

for (const file of zodFiles) {
  fs.writeFileSync(path.join("./src/schemas", file.filename), file.content);
}
```

### Folder (all interfaces across multiple files)

The `*FromFolder` functions walk a directory recursively and process every exported interface and type alias they find. Each returns a `FolderGenerationResult[]` — one entry per `(sourceFile × interface)` pair — giving you full control over where to write the output.

```typescript
import {
  generateDtosFromFolder,
  generateSchemasFromFolder,
  generateZodSchemasFromFolder,
  FolderGenerationResult,
} from "nest-schema-gen";
import * as fs from "fs";
import * as path from "path";

// Generate Swagger DTOs for every interface under src/types
const results: FolderGenerationResult[] = generateDtosFromFolder(
  "./src/types",
  { classSuffix: "Dto" },           // NestSwaggerGeneratorOptions
  { ignore: ["node_modules", "dist", "spec.ts"] }  // GenerateFromFolderOptions
);

for (const result of results) {
  console.log(`${result.sourceFile}  →  ${result.interfaceName}`);
  for (const file of result.files) {
    const dest = path.join("./generated/dto", file.filename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content);
  }
}

// Generate Mongoose schemas for every interface under src/types
const schemaResults = generateSchemasFromFolder("./src/types");

// Generate Zod schemas for every interface under src/types
const zodResults = generateZodSchemasFromFolder("./src/types", { strict: true });
```

### Available exports

| Export                          | Description                                                      |
| ------------------------------- | ---------------------------------------------------------------- |
| `generateDtos`                  | One-shot Swagger DTO generation (single file)                    |
| `generateSchemas`               | One-shot Mongoose schema generation (single file)                |
| `generateZodSchemas`            | One-shot Zod schema generation (single file)                     |
| `generateDtosFromFolder`        | Swagger DTO generation for all interfaces in a folder            |
| `generateSchemasFromFolder`     | Mongoose schema generation for all interfaces in a folder        |
| `generateZodSchemasFromFolder`  | Zod schema generation for all interfaces in a folder             |
| `TypeResolver`                  | Low-level type resolution from a `.ts` file                      |
| `NestSwaggerGenerator`          | Swagger generator class (for fine-grained control)               |
| `NestMongooseGenerator`         | Mongoose generator class (for fine-grained control)              |
| `ZodGenerator`                  | Zod generator class (for fine-grained control)                   |
| `BaseGenerator`                 | Abstract base — extend to build custom generators                |
| `FolderGenerationResult`        | Return type of the `*FromFolder` functions                       |
| `GenerateFromFolderOptions`     | Options accepted by the `*FromFolder` functions                  |

### `FolderGenerationResult`

| Field           | Type             | Description                                            |
| --------------- | ---------------- | ------------------------------------------------------ |
| `sourceFile`    | `string`         | Absolute path of the source `.ts` file                 |
| `interfaceName` | `string`         | Name of the interface or type alias that was resolved  |
| `files`         | `GeneratedFile[]`| Generated output files for this interface              |

### `GenerateFromFolderOptions`

| Option   | Type       | Default | Description                                                             |
| -------- | ---------- | ------- | ----------------------------------------------------------------------- |
| `ignore` | `string[]` | `[]`    | Substrings matched against relative file paths to skip during the walk  |

### `ZodGeneratorOptions`

| Option          | Type      | Default    | Description                                                    |
| --------------- | --------- | ---------- | -------------------------------------------------------------- |
| `emitType`      | `boolean` | `true`     | Emit `export type Foo = z.infer<typeof FooSchema>` per schema  |
| `schemaSuffix`  | `string`  | `"Schema"` | Suffix appended to the generated Zod schema const name         |
| `strict`        | `boolean` | `false`    | Add `.strict()` to object schemas to reject unknown keys       |
| `classSuffix`   | `string`  | `""`       | Suffix appended to the generated class/file base name          |
| `emitBarrel`    | `boolean` | `false`    | Emit a barrel `index.ts` re-exporting all generated files      |

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run build:watch

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

---

## License

MIT
