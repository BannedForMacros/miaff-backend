// src/docs/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';

const PORT = Number(process.env.PORT) || 3000;
const SERVER_URL = process.env.SWAGGER_SERVER_URL || `http://localhost:${PORT}`;

export const swaggerSpec = swaggerJsdoc({
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
  // Aquí buscará anotaciones JSDoc en tus rutas:
  apis: ['src/routes/*.ts'],
});
