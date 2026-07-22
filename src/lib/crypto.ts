import crypto from "crypto";

/**
 * Cifrado simétrico (AES-256-GCM) para los tokens OAuth de calendario que se
 * guardan en la base de datos. Mitiga el riesgo de privacidad señalado en la
 * investigación de mercado: los tokens nunca quedan en texto plano en la BD.
 *
 * TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64.
 * Generarla con: openssl rand -base64 32
 */

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "Falta TOKEN_ENCRYPTION_KEY en el entorno. Generar con: openssl rand -base64 32"
    );
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY debe decodificar a exactamente 32 bytes.");
  }
  return buf;
}

export function encryptToken(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Formato almacenado: iv.authTag.ciphertext (todo en base64)
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Formato de token cifrado inválido.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
