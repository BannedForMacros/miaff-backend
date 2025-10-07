// src/routes/auth.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { dbQuery } from '../db';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateRefreshToken, JwtUser, signAccessToken, sha256 } from '../utils/token';
import { requireAuth, requireRole } from '../middlewares/requireAuth';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';

const router = Router();

/* ===================== Schemas ===================== */

const registerSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  username: z.string().min(2).optional(),
  password: z.string().min(8),
  role_slug: z.string().min(2).optional(), // 👈 viene del SELECT en Swagger o la app
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(10),
});

// No fijamos enum aquí; validamos contra la BD (permite crecer roles sin tocar código)
const assignRoleSchema = z.object({
  user_id: z.string().uuid(),
  role_slug: z.string().min(2),
});

const requestResetSchema = z.object({
    email: z.string().email(),
});

const resetPasswordSchema = z.object({
    token: z.string().min(10),
    password: z.string().min(8),
});

/* ===================== Helpers ===================== */

async function getUserRoles(userId: string): Promise<string[]> {
  const { rows } = await dbQuery<{ slug: string }>(
    `SELECT r.slug
       FROM miaff.user_roles ur
       JOIN miaff.roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.map(r => r.slug);
}

async function findRoleBySlug(slug: string) {
  const { rows } = await dbQuery<{ id: string; slug: string }>(
    `SELECT id, slug
       FROM miaff.roles
      WHERE slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}

async function getAllRoles() {
  const { rows } = await dbQuery<{ id: string; name: string; slug: string; description: string | null }>(
    `SELECT id, name, slug, description
       FROM miaff.roles
      ORDER BY name ASC`
  );
  return rows;
}
async function sendPasswordResetEmail(email: string, token: string) {
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const resetLink = `miaff://reset-password?token=${token}`;

    // --- ✅ ESTA ES LA PARTE IMPORTANTE ---
    // Usamos la propiedad `html` en lugar de `text`
    const mailOptions = {
        from: '"MIIAF App" <no-reply@miiaf.com>',
        to: email,
        subject: 'Recuperación de Contraseña',
        html: `
      <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
        <h2 style="color: #0E1A2A;">Recuperación de Contraseña</h2>
        <p>Has solicitado restablecer tu contraseña para tu cuenta en MIIAF App.</p>
        <p>Haz clic en el siguiente botón para continuar:</p>
        <a 
          href="${resetLink}" 
          style="
            background-color: #D4AF37; 
            color: #1b1205; 
            padding: 15px 25px; 
            text-decoration: none; 
            border-radius: 5px; 
            display: inline-block;
            font-weight: bold;
          "
        >
          Restablecer Contraseña
        </a>
        <p style="margin-top: 20px;">
          Si no puedes hacer clic en el botón, copia y pega el siguiente enlace en tu navegador:<br>
          <span style="color: #888; font-size: 12px;">${resetLink}</span>
        </p>
        <p style="font-size: 12px; color: #888;">
          Este enlace expirará en 15 minutos.
        </p>
      </div>
    `,
    };
    // ------------------------------------

    await transporter.sendMail(mailOptions);
}

/* ===================== Endpoints ===================== */

/**
 * @openapi
 * /api/auth/roles:
 *   get:
 *     tags: [Auth]
 *     summary: "Lista de roles disponibles (para SELECT en UI)"
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/roles', async (_req, res) => {
  const roles = await getAllRoles();
  res.json({ data: roles });
});

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: "Registro de usuario (SELECT de roles; default: estudiante)"
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:   # 👈 primero → Swagger muestra formulario con dropdown
 *           schema:
 *             $ref: '#/components/schemas/AuthRegisterBody'
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthRegisterBody'
 *     responses:
 *       201: { description: "Usuario creado; devuelve access y refresh tokens" }
 *       400: { description: "Datos inválidos" }
 *       403: { description: "Auto-asignación de admin no permitida" } 
 *       409: { description: "Email ya registrado" }
 */
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });
  }

  const { email, full_name, username, password } = parsed.data;

  // ¿Existe?
  const exists = await dbQuery<{ id: string }>(
    `SELECT id FROM miaff.users WHERE email = $1`,
    [email]
  );
  if (exists.rows.length) return res.status(409).json({ message: 'Email ya registrado' });

  // Crear usuario
  const password_hash = await hashPassword(password);
  const { rows: created } = await dbQuery<{ id: string; email: string }>(
    `INSERT INTO miaff.users (email, username, full_name, password_hash, is_active, email_verified_at)
     VALUES ($1,$2,$3,$4,TRUE,NULL)
     RETURNING id,email`,
    [email, username ?? null, full_name, password_hash]
  );
  const user = created[0];
    await dbQuery(
    `INSERT INTO miaff.user_profile (user_id, xp, level)
     VALUES ($1, 0, 1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );

  // Rol elegido (si no llega o no existe → 'estudiante')
  const desired = parsed.data.role_slug?.toLowerCase().trim();
  const fallback = 'estudiante';

  // 🔒 Seguridad: evita auto-asignarse admin en el registro (elimina este bloque si quieres permitirlo)
  if (desired === 'admin') {
    return res.status(403).json({ message: 'No está permitido auto-asignarse rol admin en el registro' });
  }

  const role = desired ? await findRoleBySlug(desired) : null;
  const toAssign = role ?? (await findRoleBySlug(fallback));

  if (toAssign) {
    await dbQuery(
      `INSERT INTO miaff.user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [user.id, toAssign.id]
    );
  }

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
 *     summary: "Inicia sesión y retorna JWT + refresh"
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
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: "Correcto" }
 *       401: { description: "Credenciales inválidas" }
 */
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.issues });

  const { email, password } = parsed.data;
  const { rows } = await dbQuery<{
    id: string; email: string; password_hash: string; is_active: boolean;
  }>(
    `SELECT id,email,password_hash,is_active
       FROM miaff.users
      WHERE email = $1`,
    [email]
  );

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
 *     summary: "Intercambia un refresh token válido por un nuevo access token (rotado)"
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
 *       200: { description: "OK" }
 *       401: { description: "Refresh inválido" }
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
  const { rows: urows } = await dbQuery<{ email: string }>(
    `SELECT email FROM miaff.users WHERE id = $1`,
    [sess.user_id]
  );
  const roles = await getUserRoles(sess.user_id);
  const access = signAccessToken({ sub: sess.user_id, email: urows[0].email, roles });

  res.json({ access_token: access, refresh_token: newRefresh });
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: "Revoca una sesión (refresh token)"
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
 *       204: { description: "Cerrada la sesión" }
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
 *     summary: "Asigna un rol a un usuario (solo admin)"
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             $ref: '#/components/schemas/AssignRoleBody'   # 👈 SELECT
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignRoleBody'   # 👈 SELECT
 *     responses:
 *       204: { description: "Rol asignado" }
 *       400: { description: "Datos inválidos o rol inexistente" }
 *       403: { description: "Prohibido" }
 */
router.post('/assign-role', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos' });

  const { user_id, role_slug } = parsed.data;

  const role = await findRoleBySlug(role_slug.toLowerCase().trim());
  if (!role) return res.status(400).json({ message: `El rol '${role_slug}' no existe` });

  await dbQuery(
    `INSERT INTO miaff.user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [user_id, role.id]
  );
  res.status(204).send();
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: "Retorna el usuario autenticado (desde JWT)"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "OK" }
 *       401: { description: "No autorizado" }
 */
router.get('/me', requireAuth, (req, res) => {
  const me = (req as any).user as JwtUser;
  res.json({ user: me });
});
/**
 * @openapi
 * /api/auth/request-reset:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Solicita un enlace para restablecer la contraseña
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Si el usuario existe, se envió un correo
 */
router.post('/request-reset', async (req, res) => {
    const parsed = requestResetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Email inválido' });

    const { email } = parsed.data;
    const { rows } = await dbQuery<{ id: string }>(
        `SELECT id FROM miaff.users WHERE email = $1`,
        [email]
    );
    const user = rows[0];

    if (user) {
        const token = randomBytes(32).toString('hex');
        const tokenHash = sha256(token);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        await dbQuery(
            `INSERT INTO miaff.password_resets (user_id, token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, tokenHash, expiresAt]
        );

        await sendPasswordResetEmail(email, token);
    }

    res.json({
        message:
            'Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.',
    });
});

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Establece una nueva contraseña usando un token válido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       204:
 *         description: Contraseña actualizada con éxito
 *       400:
 *         description: Token inválido, expirado o datos incorrectos
 */
router.post('/reset-password', async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Datos inválidos' });

    const { token, password } = parsed.data;
    const tokenHash = sha256(token);

    const { rows } = await dbQuery<{ user_id: string }>(
        `SELECT user_id FROM miaff.password_resets
         WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL`,
        [tokenHash]
    );
    const resetRequest = rows[0];

    if (!resetRequest) {
        return res.status(400).json({ message: 'El token es inválido o ha expirado.' });
    }

    const { user_id } = resetRequest;
    const password_hash = await hashPassword(password);

    await dbQuery(`UPDATE miaff.users SET password_hash = $1 WHERE id = $2`, [
        password_hash,
        user_id,
    ]);

    await dbQuery(`UPDATE miaff.password_resets SET used_at = NOW() WHERE token_hash = $1`, [
        tokenHash,
    ]);

    // Revocar sesiones activas por seguridad
    await dbQuery(`UPDATE miaff.auth_sessions SET revoked_at = NOW() WHERE user_id = $1`, [
        user_id,
    ]);

    res.status(204).send();
});



export default router;
