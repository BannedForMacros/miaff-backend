// src/routes/profile.routes.ts
import { Router } from 'express';
import { dbQuery } from '../db';
import { requireAuth } from '../middlewares/requireAuth';
import type { JwtUser } from '../utils/token';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Profile
 *     description: Perfil del usuario, XP y niveles (gamificación)
 */

/**
 * Calcula el nivel a partir del XP usando miaff.levels (id, name, min_xp)
 */
async function computeLevel(xp: number) {
  const { rows } = await dbQuery<{ id: number; name: string; min_xp: number }>(
    `SELECT id, name, min_xp
       FROM miaff.levels
      ORDER BY min_xp ASC`
  );

  if (!rows.length) {
    // fallback seguro si aún no has llenado 'levels'
    return {
      level: 1,
      level_name: 'Nivel 1',
      level_min_xp: 0,
      next_level: null as number | null,
      next_level_min_xp: null as number | null,
      progress_pct: 1,
    };
  }

  let current = rows[0];
  let next: typeof current | null = null;

  for (let i = 0; i < rows.length; i++) {
    if (xp >= rows[i].min_xp) {
      current = rows[i];
      next = rows[i + 1] ?? null;
    } else {
      break;
    }
  }

  const base = current.min_xp;
  const top = next ? next.min_xp : base + 100; // evita división por 0 si es el último nivel
  const pct = next ? Math.max(0, Math.min(1, (xp - base) / (top - base))) : 1;

  return {
    level: current.id,
    level_name: current.name,
    level_min_xp: current.min_xp,
    next_level: next?.id ?? null,
    next_level_min_xp: next?.min_xp ?? null,
    progress_pct: Number(pct.toFixed(2)),
  };
}

/**
 * Obtiene o inicializa el perfil (miaff.user_profile)
 */
async function getOrInitProfile(userId: string) {
  const q1 = await dbQuery<{ user_id: string; xp: number }>(
    `SELECT user_id, xp
       FROM miaff.user_profile
      WHERE user_id = $1`,
    [userId]
  );

  if (q1.rows.length) return q1.rows[0];

  await dbQuery(
    `INSERT INTO miaff.user_profile (user_id, xp)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  return { user_id: userId, xp: 0 };
}

/**
 * @openapi
 * /api/profile/me:
 *   get:
 *     tags: [Profile]
 *     summary: Perfil del usuario autenticado (XP, nivel y progreso)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/me', requireAuth, async (req, res) => {
  const me = (req as any).user as JwtUser; // ← viene del JWT (requireAuth)
  // NADA de valores de ejemplo aquí
  const prof = await getOrInitProfile(me.sub);
  const lvl = await computeLevel(Number(prof.xp) || 0);

  // (Opcional) Traer nombre/username del usuario
  const { rows: urows } = await dbQuery<{ username: string | null; full_name: string | null }>(
    `SELECT username, full_name
       FROM miaff.users
      WHERE id = $1`,
    [me.sub]
  );
  const meta = urows[0] ?? { username: null, full_name: null };

  res.json({
    user: {
      sub: me.sub,
      email: me.email,
      roles: me.roles,
      username: meta.username,
      full_name: meta.full_name,
    },
    profile: {
      user_id: prof.user_id,
      xp: Number(prof.xp) || 0,
      ...lvl,
    },
  });
});

export default router;
