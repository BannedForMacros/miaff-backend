// src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { getSwaggerSpec } from './docs/swagger';
import { config } from './config';

import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';
import simulationRoutes from './routes/simulation.routes';
import catalogRoutes from './routes/catalog.routes';
 // 👈 }

const app = express();

// Si corres detrás de un proxy (nginx/railway/heroku), esto permite obtener la IP real en req.ip
app.set('trust proxy', true);

// Middlewares básicos
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // necesario para x-www-form-urlencoded
app.use(morgan('dev'));

// Rutas de la API
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api/catalog', catalogRoutes);

// Servir OpenAPI (JSON) en caliente
app.get('/openapi.json', async (_req: Request, res: Response) => {
  try {
    const spec = await getSwaggerSpec();
    res.json(spec);
  } catch (e) {
    console.error('openapi error:', e);
    res.status(500).json({ message: 'No se pudo generar el OpenAPI' });
  }
});

// Swagger UI leyendo desde /openapi.json
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    explorer: true,
    swaggerUrl: '/openapi.json',
  }),
);

// 404 (opcional)
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// Manejador de errores (fallback)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err?.status || 500).json({ message: err?.message || 'Internal Server Error' });
});

// Arranque (0.0.0.0 para accesos desde emuladores/dispositivos)
app.listen(config.port, '0.0.0.0', () => {
  console.log(`MIAFF API listening on http://localhost:${config.port}`);
  console.log(`Docs: http://localhost:${config.port}/docs`);
});
