# nest-schema-gen

> TypeScript interface → NestJS boilerplate, instantly.

`nest-schema-gen` reads your TypeScript interfaces and type aliases and generates fully-decorated **Swagger DTOs** (`@nestjs/swagger` + `class-validator`) and **Mongoose schemas** (`@nestjs/mongoose`) — eliminating the hand-written boilerplate that lives between your domain types and your API/database layers.

---

## Features

- **Swagger DTO generation** — `@ApiProperty`, `@IsString`, `@IsOptional`, `@IsArray`, `@Type`, etc.
- **Mongoose schema generation** — `@Schema`, `@Prop`, `SchemaFactory`, inline union types
- **Deep type resolution** — follows `import`s, resolves generics, handles enums, unions, intersections, and nested interfaces
- **Barrel file emission** — optional `index.ts` re-exporting all generated files
- **Dry-run mode** — preview output in the terminal without writing files
- **Programmatic API** — use `generateDtos` / `generateSchemas` directly in Node scripts

---

## Installation

### Global (CLI use)

```bash
# from npm
npm install -g nest-schema-gen

# directly from GitHub
npm install -g github:YOUR_USERNAME/nest-schema-gen
```

### Local (programmatic use)

```bash
npm install --save-dev nest-schema-gen
```

---

## CLI Usage

```
nest-schema-gen <file> <InterfaceName> [options]
```

### Arguments

| Argument        | Description                                          |
| --------------- | ---------------------------------------------------- |
| `file`          | Path to the TypeScript source file                   |
| `InterfaceName` | Name of the interface or type alias to convert       |

### Options

| Flag                   | Description                                              | Default       |
| ---------------------- | -------------------------------------------------------- | ------------- |
| `--generator <kind>`   | Generator to use: `swagger` \| `mongoose`                | `swagger`     |
| `--out <dir>`          | Output directory                                         | `./generated` |
| `--suffix <suffix>`    | Class name suffix                                        | `Dto` / `""`  |
| `--barrel`             | Emit a barrel `index.ts`                                 | off           |
| `--dry-run`            | Print generated files to stdout, skip writing            | off           |
| `--no-validator`       | *(swagger)* Disable `class-validator` decorators         | on            |
| `--no-transformer`     | *(swagger)* Disable `@Type` decorators                   | on            |
| `--no-timestamps`      | *(mongoose)* Disable `{ timestamps: true }` on `@Schema` | on            |
| `--emit-interface`     | *(mongoose)* Emit a companion lean document interface    | off           |

### Examples

```bash
# Generate a Swagger DTO
nest-schema-gen src/types/user.ts IUser

# Generate a Mongoose schema in a specific output directory
nest-schema-gen src/types/user.ts IUser --generator mongoose --out src/schemas

# Preview output without writing files
nest-schema-gen src/types/user.ts IUser --dry-run

# Emit a barrel index.ts alongside the generated files
nest-schema-gen src/types/user.ts IUser --barrel --out src/dto
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

---

## Programmatic API

```typescript
import { generateDtos, generateSchemas } from "nest-schema-gen";
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
```

### Available exports

| Export                    | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `generateDtos`            | One-shot Swagger DTO generation                         |
| `generateSchemas`         | One-shot Mongoose schema generation                     |
| `TypeResolver`            | Low-level type resolution from a `.ts` file             |
| `NestSwaggerGenerator`    | Swagger generator class (for fine-grained control)      |
| `NestMongooseGenerator`   | Mongoose generator class (for fine-grained control)     |
| `BaseGenerator`           | Abstract base — extend to build custom generators       |


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
