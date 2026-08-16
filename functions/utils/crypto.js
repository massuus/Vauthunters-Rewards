const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function hexToBytes(value) {
  const source = String(value || '').trim();
  if (!source || source.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(source)) {
    return null;
  }

  const bytes = new Uint8Array(source.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(source.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function getEncryptionKey(secret) {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(String(secret || '')));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptSecret(value, secret) {
  if (!secret || String(secret).length < 24) {
    throw new Error('TWITCH_TOKEN_ENCRYPTION_KEY must be at least 24 characters.');
  }

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await getEncryptionKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(String(value || ''))
  );

  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value, secret) {
  const [version, ivValue, encryptedValue] = String(value || '').split('.');
  if (version !== 'v1' || !ivValue || !encryptedValue) {
    throw new Error('Encrypted value has an unsupported format.');
  }

  const key = await getEncryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(ivValue) },
    key,
    base64UrlToBytes(encryptedValue)
  );
  return decoder.decode(decrypted);
}
