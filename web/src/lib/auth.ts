import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'jubis-secret-key-change-in-production'
);
const COOKIE_NAME = 'jubis_token';
const MAX_AGE = 60 * 60 * 24 * 7; // 7일

export interface JwtPayload extends JWTPayload {
  sub: string;
  role: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME, MAX_AGE };
