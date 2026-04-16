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
exports.DtoGenerator = exports.NestMongooseGenerator = exports.NestSwaggerGenerator = exports.ImportBuilder = exports.BaseGenerator = exports.TypeResolver = void 0;
exports.generateDtos = generateDtos;
exports.generateSchemas = generateSchemas;
var resolver_1 = require("./resolver");
Object.defineProperty(exports, "TypeResolver", { enumerable: true, get: function () { return resolver_1.TypeResolver; } });
var base_generator_1 = require("./base-generator");
Object.defineProperty(exports, "BaseGenerator", { enumerable: true, get: function () { return base_generator_1.BaseGenerator; } });
Object.defineProperty(exports, "ImportBuilder", { enumerable: true, get: function () { return base_generator_1.ImportBuilder; } });
var nest_swagger_generator_1 = require("./nest-swagger-generator");
Object.defineProperty(exports, "NestSwaggerGenerator", { enumerable: true, get: function () { return nest_swagger_generator_1.NestSwaggerGenerator; } });
var nest_mongoose_generator_1 = require("./nest-mongoose-generator");
Object.defineProperty(exports, "NestMongooseGenerator", { enumerable: true, get: function () { return nest_mongoose_generator_1.NestMongooseGenerator; } });
// Legacy re-exports for backwards compatibility
var nest_swagger_generator_2 = require("./nest-swagger-generator");
Object.defineProperty(exports, "DtoGenerator", { enumerable: true, get: function () { return nest_swagger_generator_2.DtoGenerator; } });
const path = __importStar(require("path"));
const resolver_2 = require("./resolver");
const nest_swagger_generator_3 = require("./nest-swagger-generator");
const nest_mongoose_generator_2 = require("./nest-mongoose-generator");
/**
 * One-shot API: resolve an interface and generate Swagger DTOs.
 *
 * @example
 * ```ts
 * import { generateDtos } from 'nest-schema-gen';
 * const files = generateDtos('./src/types/user.ts', 'IUser');
 * for (const f of files) fs.writeFileSync(f.filename, f.content);
 * ```
 */
function generateDtos(filePath, interfaceName, opts = {}) {
    const resolver = new resolver_2.TypeResolver(path.resolve(filePath));
    const result = resolver.resolve(interfaceName);
    return new nest_swagger_generator_3.NestSwaggerGenerator(opts).generate(result);
}
/**
 * One-shot API: resolve an interface and generate Mongoose schemas.
 *
 * @example
 * ```ts
 * import { generateSchemas } from 'nest-schema-gen';
 * const files = generateSchemas('./src/types/user.ts', 'IUser');
 * for (const f of files) fs.writeFileSync(f.filename, f.content);
 * ```
 */
function generateSchemas(filePath, interfaceName, opts = {}) {
    const resolver = new resolver_2.TypeResolver(path.resolve(filePath));
    const result = resolver.resolve(interfaceName);
    return new nest_mongoose_generator_2.NestMongooseGenerator(opts).generate(result);
}
