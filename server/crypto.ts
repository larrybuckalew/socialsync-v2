import crypto from 'crypto';

// AES-256-GCM. Output format: v1.<iv b64>.<tag b64>.<ciphertext b64>
export function encryptJson(key: Buffer, value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.from(JSON.stringify(value), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptJson<T = any>(key: Buffer, blob: string): T {
  const [v, ivB, tagB, ctB] = blob.split('.');
  if (v !== 'v1' || !ivB || !tagB || !ctB) throw new Error('Unsupported encrypted blob');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

export function randomState(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function appSecretProof(token: string, appSecret: string) {
  return crypto.createHmac('sha256', appSecret).update(token).digest('hex');
}
