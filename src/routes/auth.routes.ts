import { Router } from 'express';
import { z } from 'zod';
import { dbQuery } from '../db';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateRefreshToken, JwtUser, signAccessToken, sha256 } from '../utils/token';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  username: z.string().min(2).optional(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(10),
});

const assignRoleSchema = z.object({
  user_id: z.string().uuid(),
  role_slug: z.enum(['admin', 'maestro', 'estudiante']),
});

async function getUserRoles(userId: string): Promise<string[]> {
  const { rows } = await dbQuery<{ slug: string }>(
    `SELECT r.slug FROM miaff.user_roles ur
     JOIN miaff.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.map(r => r.slug);
}

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: "Registro de usuario (rol por defecto: estudiante)"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, full_name, password]
 *             properties:
 *               email: { type: string, format: email }
 *               full_name: { type: string }
 *               username: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: "Usuario creado; devuelve access y refresh tokens" }
 *       400: { description: "Datos inválidos" }
 *       409: { description: "Email ya registrado" }
 */

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });

  const { email, full_name, username, password } = parsed.data;

  // ¿Existe?
  const exists = await dbQuery<{ id: string }>(`SELECT id FROM miaff.users WHERE email = $1`, [email]);
  if (exists.rows.length) return res.status(409).json({ message: 'Email ya registrado' });

  const password_hash = await hashPassword(password);

  // Crear usuario
  const { rows: created } = await dbQuery<{ id: string; email: string }>(
    `INSERT INTO miaff.users (email, username, full_name, password_hash, is_active, email_verified_at)
     VALUES ($1,$2,$3,$4,TRUE,NULL) RETURNING id,email`,
    [email, username ?? null, full_name, password_hash]
  );
  const user = created[0];

  // Rol por defecto: estudiante (si existe)
  await dbQuery(
    `INSERT INTO miaff.user_roles (user_id, role_id)
     SELECT $1, r.id FROM miaff.roles r WHERE r.slug='estudiante'
     ON CONFLICT DO NOTHING`,
    [user.id]
  );

  const roles = await getUserRoles(user.id);

  // Crear sesión (refresh)
  const { token: refreshToken, hash: refreshHash, expiresAt } = generateRefreshToken();
  await dbQuery(
    `INSERT INTO miaff.auth_sessions
       (user_id, refresh_token_hash, user_agent, ip_addr, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [user.id, refreshHash, req.headers['user-agent'] ?? null, req.ip, expiresAt]
  );

  const access = signAccessToken({ sub: user.id, email: user.email, roles });

  res.status(201).json({
    access_token: access,
    refresh_token: refreshToken,
    user: { id: user.id, email: user.email, roles },
  });
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Inicia sesión y retorna JWT + refresh
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Correcto }
 *       401: { description: Credenciales inválidas }
 */
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });

  const { email, password } = parsed.data;
  const { rows } = await dbQuery<{
    id: string; email: string; password_hash: string; is_active: boolean;
  }>(`SELECT id,email,password_hash,is_active FROM miaff.users WHERE email = $1`, [email]);

  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ message: 'Credenciales inválidas' });

  const ok = await verifyPassword(user.password_hash, password);
  if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });

  const roles = await getUserRoles(user.id);

  const { token: refreshToken, hash: refreshHash, expiresAt } = generateRefreshToken();
  await dbQuery(
    `INSERT INTO miaff.auth_sessions (user_id, refresh_token_hash, user_agent, ip_addr, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [user.id, refreshHash, req.headers['user-agent'] ?? null, req.ip, expiresAt]
  );

  const access = signAccessToken({ sub: user.id, email: user.email, roles });

  res.json({
    access_token: access,
    refresh_token: refreshToken,
    user: { id: user.id, email: user.email, roles },
  });
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Intercambia un refresh token válido por un nuevo access token (rotado)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Refresh inválido }
 */
router.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos' });

  const incoming = parsed.data.refresh_token;
  const incomingHash = sha256(incoming);

  // Buscar sesión por hash
  const { rows } = await dbQuery<{ id: string; user_id: string }>(
    `SELECT id, user_id
       FROM miaff.auth_sessions
      WHERE refresh_token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [incomingHash]
  );
  const sess = rows[0];
  if (!sess) return res.status(401).json({ message: 'Refresh inválido' });

  // Rotación: generar nuevo refresh y reemplazar
  const { token: newRefresh, hash: newHash, expiresAt } = generateRefreshToken();
  await dbQuery(
    `UPDATE miaff.auth_sessions
        SET refresh_token_hash = $1,
            expires_at = $2,
            updated_at = NOW()
      WHERE id = $3`,
    [newHash, expiresAt, sess.id]
  );

  // Emitir nuevo access con roles actuales
  const { rows: urows } = await dbQuery<{ email: string }>(`SELECT email FROM miaff.users WHERE id = $1`, [sess.user_id]);
  const roles = await getUserRoles(sess.user_id);
  const access = signAccessToken({ sub: sess.user_id, email: urows[0].email, roles });

  res.json({ access_token: access, refresh_token: newRefresh });
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoca una sesión (refresh token)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token: { type: string }
 *     responses:
 *       204: { description: Cerrada la sesión }
 */
router.post('/logout', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos' });

  const hash = sha256(parsed.data.refresh_token);
  await dbQuery(
    `UPDATE miaff.auth_sessions
        SET revoked_at = NOW(), updated_at = NOW()
      WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
    [hash]
  );
  res.status(204).send();
});

/**
 * @openapi
 * /api/auth/assign-role:
 *   post:
 *     tags: [Auth]
 *     summary: Asigna un rol a un usuario (solo admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, role_slug]
 *             properties:
 *               user_id: { type: string, format: uuid }
 *               role_slug: { type: string, enum: [admin, maestro, estudiante] }
 *     responses:
 *       204: { description: Rol asignado }
 *       400: { description: Datos inválidos }
 *       403: { description: Prohibido }
 */
router.post('/assign-role', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos' });

  const { user_id, role_slug } = parsed.data;

  await dbQuery(
    `INSERT INTO miaff.user_roles (user_id, role_id)
     SELECT $1, r.id FROM miaff.roles r WHERE r.slug = $2
     ON CONFLICT DO NOTHING`,
    [user_id, role_slug]
  );
  res.status(204).send();
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Retorna el usuario autenticado (desde JWT)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: OK }
 *       401: { description: No autorizado }
 */
router.get('/me', requireAuth, (req, res) => {
  const me = (req as any).user as JwtUser;
  res.json({ user: me });
});

export default router;
