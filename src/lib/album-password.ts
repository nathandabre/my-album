import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

function bcryptInput(password: string) {
  return createHash("sha256")
    .update("my-album:bcrypt-password:v1:")
    .update(password)
    .digest("base64");
}

export async function hashAlbumPassword(password: string) {
  return bcrypt.hash(bcryptInput(password), BCRYPT_ROUNDS);
}

export async function verifyAlbumPassword(
  password: string,
  passwordHash: string,
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (/^\$2[aby]\$\d\d\$/.test(passwordHash)) {
    return {
      valid: await bcrypt.compare(bcryptInput(password), passwordHash),
      needsUpgrade: false,
    };
  }

  if (!/^[a-f0-9]{64}$/i.test(passwordHash)) {
    return { valid: false, needsUpgrade: false };
  }

  const legacyHash = createHash("sha256")
    .update(password.trim())
    .digest();
  const expectedHash = Buffer.from(passwordHash, "hex");
  const valid =
    legacyHash.length === expectedHash.length &&
    timingSafeEqual(legacyHash, expectedHash);

  return { valid, needsUpgrade: valid };
}
