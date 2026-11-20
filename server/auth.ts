import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AppConfig } from './config';

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface AuthedUser { uid: string; email: string | null; emailVerified: boolean }

export type TokenVerifier = (token: string) => Promise<JWTPayload>;

export function firebaseVerifier(projectId: string): TokenVerifier {
  return async (token: string) => {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    if (!payload.sub) throw new Error('Token has no subject');
    return payload;
  };
}

/** Express middleware: requires `Authorization: Bearer <Firebase ID token>` from an allowed user. */
export function requireUser(config: AppConfig, verify: TokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) return res.status(401).json({ error: 'Not signed in' });
    try {
      const p = await verify(m[1]);
      const email = typeof p.email === 'string' ? p.email.toLowerCase() : null;
      const emailVerified = p.email_verified === true;
      if (!config.allowAnyFirebaseUser) {
        const uidOk = config.allowedUids.includes(String(p.sub));
        const emailOk = !!email && config.allowedEmails.includes(email) && (emailVerified || config.allowUnverifiedEmail);
        if (!uidOk && !emailOk) {
          return res.status(403).json({ error: 'This account is not allowed to use SocialSync' });
        }
      }
      (req as any).user = { uid: String(p.sub), email, emailVerified } as AuthedUser;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired sign-in, please sign in again' });
    }
  };
}

export function currentUser(req: Request): AuthedUser {
  return (req as any).user;
}
