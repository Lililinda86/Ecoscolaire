/**
 * Hash a PIN or password using SHA-256 (Web Crypto API)
 * @param text The plain text to hash
 * @returns A promise resolving to the hex string of the hash
 */
export async function hashPIN(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
