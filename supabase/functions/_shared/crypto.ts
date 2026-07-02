// refresh_token을 DB에 평문으로 저장하지 않기 위한 AES-256-GCM 암복호화.
// 키는 DRIVE_TOKEN_ENC_KEY (base64, 32바이트) 시크릿에서 가져온다.

function getKeyBytes(): Uint8Array {
  const base64Key = Deno.env.get("DRIVE_TOKEN_ENC_KEY");
  if (!base64Key) {
    throw new Error("DRIVE_TOKEN_ENC_KEY secret이 설정되지 않았습니다.");
  }
  return Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
}

async function getCryptoKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", getKeyBytes(), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function encryptSecret(
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

export async function decryptSecret(
  ciphertext: string,
  iv: string,
): Promise<string> {
  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}
