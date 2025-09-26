import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export type JwtUser = { sub: string; email: string; roles: string[] };

export function signAccessToken(payload: JwtUser): string {
  // 1. Determinamos el valor del tiempo de expiración.
  const tokenDuration = process.env.ACCESS_TOKEN_TTL || '15m';

  // 2. Creamos el objeto de opciones.
  const options: SignOptions = {
    // 3. Usamos "as any" para forzar la asignación del tipo.
    expiresIn: tokenDuration as any
  };
  
  // 4. Pasamos el objeto a la función.
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyAccessToken(token: string): JwtUser {
  return jwt.verify(token, config.jwtSecret) as JwtUser;
}

export function generateRefreshToken() {
  const token = crypto.randomBytes(32).toString('hex'); // texto plano que se entrega al cliente
  const hash = sha256(token);                           // se guarda SOLO el HASH en DB
  const expiresAt = new Date(Date.now() + (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 7) * 86400_000);
  return { token, hash, expiresAt };
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
