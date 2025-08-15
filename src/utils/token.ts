import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export type JwtUser = { sub: string; email: string; roles: string[] };

export function signAccessToken(payload: JwtUser): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' });
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
