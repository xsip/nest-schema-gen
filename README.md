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
  USER = "user",
  ADMIN = "admin",
}

export interface IUser {
  username: string;
  email: string;
  password: string;
  roles?: Array<Roles>;
  inlineRoles: ("test1" | "test2" | "test3")[];
}
```

**Swagger DTO output** (`--generator swagger`):

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";
import { Roles } from "./Roles";

export class UserDto {
  @ApiProperty({ type: "string" })
  @IsString()
  username!: string;

  @ApiProperty({ type: "string" })
  @IsString()
  email!: string;

  @ApiProperty({ type: "string" })
  @IsString()
  password!: string;

  @ApiProperty({ required: false, isArray: true, enum: Roles })
  @IsOptional()
  @IsArray()
  roles?: Roles[];

  @ApiProperty({ isArray: true, enum: ["test1", "test2", "test3"] })
  @IsArray()
  inlineRoles!: ("test1" | "test2" | "test3")[];
}
```

**Mongoose schema output** (`--generator mongoose`):

```typescript
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { mongoose } from "mongoose";
import { Roles } from "./Roles";

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, type: String })
  username!: string;

  @Prop({ required: true, type: String })
  email!: string;

  @Prop({ required: true, type: String })
  password!: string;

  @Prop({ type: String, enum: Roles })
  roles?: Roles[];

  @Prop({ required: true, type: mongoose.Schema.Types.Mixed })
  inlineRoles!: ("test1" | "test2" | "test3")[];
}

export const UserSchema = SchemaFactory.createForClass(User);
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

## Peer Dependencies

All peer dependencies are **optional** — only install what you actually use.

| Package              | Required for         |
| -------------------- | -------------------- |
| `@nestjs/swagger`    | Swagger DTO output   |
| `class-validator`    | Swagger DTO output   |
| `class-transformer`  | Swagger DTO output   |
| `@nestjs/mongoose`   | Mongoose schema output |
| `mongoose`           | Mongoose schema output |

---

## Publishing to npm

```bash
# Build first
npm run build

# Publish
npm publish

# Or publish under a scope
npm publish --access public
```

> The `prepublishOnly` script runs `tsc` automatically before publishing.

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