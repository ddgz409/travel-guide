/** ArrayBuffer -> base64，兼容 RN（无 btoa 时走手写实现） */

function encodeBinaryToBase64(binary: string): string {
  if (typeof btoa === "function") return btoa(binary);
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

/** UTF-8 字符串 -> base64 */
export function stringToBase64(text: string): string {
  if (typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return encodeBinaryToBase64(binary);
  }
  return encodeBinaryToBase64(unescape(encodeURIComponent(text)));
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return encodeBinaryToBase64(binary);
}
