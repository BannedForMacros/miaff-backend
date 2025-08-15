import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtUser } from '../utils/token';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  if (!hdr?.startsWith('Bearer ')) return res.status(401).json({ message: 'No autorizado' });
  try {
    const token = hdr.slice(7);
    const payload = verifyAccessToken(token);
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JwtUser | undefined;
    if (!user) return res.status(401).json({ message: 'No autorizado' });
    const ok = roles.some(r => user.roles.includes(r));
    if (!ok) return res.status(403).json({ message: 'Prohibido' });
    next();
  };
}
