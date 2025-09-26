import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtUser } from '../utils/token';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  console.log('=== DEBUG MIDDLEWARE ===');
  console.log('Headers completos:', req.headers);
  console.log('Authorization header:', req.headers.authorization);
  console.log('Método:', req.method);
  console.log('URL:', req.url);
  
  const hdr = req.headers.authorization;
  
  if (!hdr) {
    console.log('❌ No hay header Authorization');
    return res.status(401).json({ message: 'No autorizado' });
  }
  
  if (!hdr.startsWith('Bearer ')) {
    console.log('❌ Header no empieza con Bearer:', hdr);
    return res.status(401).json({ message: 'No autorizado' });
  }
  
  try {
    const token = hdr.slice(7);
    console.log('Token extraído:', token.substring(0, 20) + '...');
    
    const payload = verifyAccessToken(token);
    console.log('✅ Token válido, payload:', payload);
    
    (req as any).user = payload;
    next();
  } catch (error) {
    console.log('❌ Error al verificar token:', error);
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
