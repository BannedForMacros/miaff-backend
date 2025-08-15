// src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs/swagger';
import { config } from './config';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.routes';

const app = express();

// Middlewares básicos
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Rutas de la API
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);

// Swagger (UI y JSON del spec)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get('/openapi.json', (_req: Request, res: Response) => res.json(swaggerSpec));

// Manejador 404 (opcional, útil en desarrollo)
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// Manejador de errores (fallback)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err?.status || 500).json({ message: err?.message || 'Internal Server Error' });
});

// Arranque
app.listen(config.port, () => {
  console.log(`MIAFF API listening on http://localhost:${config.port}`);
  console.log(`Docs: http://localhost:${config.port}/docs`);
});
