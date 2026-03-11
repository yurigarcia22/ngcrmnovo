import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
    const key = process.env.EMAIL_ENCRYPTION_KEY;
    if (!key) {
        // Fallback to a derived key from the service role key (not ideal but functional)
        const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-fallback-key-32-chars!!';
        return crypto.createHash('sha256').update(fallback).digest();
    }
    // Key should be 64 hex chars = 32 bytes
    return Buffer.from(key, 'hex');
}

export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedString: string): string {
    const key = getEncryptionKey();
    const parts = encryptedString.split(':');

    if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
