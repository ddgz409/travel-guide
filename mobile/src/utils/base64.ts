/** ArrayBuffer -> base64，兼容 RN（无 btoa 时走手写实现） */

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa available on web; RN has global base64 via Buffer sometimes - use chunked
  if (typeof btoa === "function") return btoa(binary);
  // fallback
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = binary.charCodeAt(i + 1);
    const c = binary.charCodeAt(i + 2);
    const bitmap = (a << 16) | ((b || 0) << 8) | (c || 0);
    output +=
      chars.charAt((bitmap >> 18) & 63) +
      chars.charAt((bitmap >> 12) & 63) +
      (i + 1 < binary.length ? chars.charAt((bitmap >> 6) & 63) : "=") +
      (i + 2 < binary.length ? chars.charAt(bitmap & 63) : "=");
  }
  return output;
}
