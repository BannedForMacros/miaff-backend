// src/docs/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import { dbQuery } from '../db';

const PORT = Number(process.env.PORT) || 3000;
const SERVER_URL = process.env.SWAGGER_SERVER_URL || `http://localhost:${PORT}`;

export async function getSwaggerSpec() {
  // Base desde anotaciones JSDoc
  const base: any = swaggerJsdoc({
    definition: {
      openapi: '3.0.3',
      info: {
        title: 'MIAFF API',
        version: '1.0.0',
        description: 'Documentación OpenAPI de la API MIAFF.',
      },
      servers: [{ url: SERVER_URL }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    apis: ['src/routes/*.ts', 'src/routes/**/*.ts'],
  });

  // Traer roles desde BD (con fallback si falla)
  let roleEnum: string[] = [];
  try {
    const { rows } = await dbQuery<{ slug: string }>(
      `SELECT slug FROM miaff.roles ORDER BY slug ASC`
    );
    roleEnum = rows.map(r => r.slug);
  } catch (err) {
    console.warn('[swagger] No se pudo leer roles de la BD. Usando fallback.');
    roleEnum = ['estudiante', 'maestro', 'admin'];
  }

  base.components = base.components ?? {};
  base.components.schemas = base.components.schemas ?? {};

  // Enum → Swagger UI lo mostrará como SELECT en formularios
  base.components.schemas.RoleSlug = {
    type: 'string',
    enum: roleEnum,
    description: 'Rol disponible (desde BD o fallback)',
  };

  // Cuerpo de /register
  base.components.schemas.AuthRegisterBody = {
    type: 'object',
    required: ['email', 'full_name', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      full_name: { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string', minLength: 8 },
      role_slug: { $ref: '#/components/schemas/RoleSlug' }, // ← SELECT
    },
  };

  // Cuerpo de /assign-role (si lo usas)
  base.components.schemas.AssignRoleBody = {
    type: 'object',
    required: ['user_id', 'role_slug'],
    properties: {
      user_id: { type: 'string', format: 'uuid' },
      role_slug: { $ref: '#/components/schemas/RoleSlug' }, // ← SELECT
    },
  };

  return base;
}
