import * as ExpoCrypto from "expo-crypto";
import { md5 } from "js-md5";
import * as aesjs from "aes-js";

/**
 * Globals injected into the Hermes context before evaluating an InkDex
 * IIFE bundle. Extension bundles expect a browser-shaped `crypto.subtle`
 * (AES-CBC only — that's the superset InkDex/Paperback sources actually
 * use for decrypting obfuscated API responses), base64 helpers, and a
 * synchronous MD5 (commonly used for CDN signature query params).
 *
 * Real bundle evaluation would inject these via a JS engine boundary
 * (e.g. `new Function(...)(sandboxGlobals)` or a QuickJS/Hermes isolate).
 * This module is that global bag.
 */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoaPolyfill(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atobPolyfill(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function btoaPolyfill(input: string): string {
  let output = "";
  let i = 0;
  while (i < input.length) {
    const a = input.charCodeAt(i++);
    const b = i < input.length ? input.charCodeAt(i++) : NaN;
    const c = i < input.length ? input.charCodeAt(i++) : NaN;
    const enc1 = a >> 2;
    const enc2 = ((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4);
    const enc3 = isNaN(b) ? 64 : ((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6);
    const enc4 = isNaN(c) ? 64 : c & 63;
    output +=
      B64_CHARS.charAt(enc1) +
      B64_CHARS.charAt(enc2) +
      (enc3 === 64 ? "=" : B64_CHARS.charAt(enc3)) +
      (enc4 === 64 ? "=" : B64_CHARS.charAt(enc4));
  }
  return output;
}

function atobPolyfill(input: string): string {
  const clean = input.replace(/=+$/, "");
  let output = "";
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = (value << 6) | B64_CHARS.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return output;
}

export const sandboxAtob = atobPolyfill;
export const sandboxBtoa = btoaPolyfill;

export const sandboxMd5 = (input: string): string => md5.hex(input);

/**
 * Minimal WebCrypto `subtle` surface — AES-CBC only, matching what InkDex
 * source bundles actually invoke for decrypting scrambled API payloads
 * (confirmed against real bundles: sources that obfuscate chapter/page
 * data behind an AES-CBC layer keyed by a site-specific secret).
 *
 * Implemented with `aes-js` (pure JS, no native module) rather than a
 * native AES library — RN/Hermes has no built-in WebCrypto, and a pure-JS
 * implementation avoids requiring a dev-client rebuild for a native
 * dependency just to unblock these sources.
 */
type SubtleKey = { _rawKey: Uint8Array };

export const sandboxSubtle = {
  async importKey(
    _format: "raw",
    keyData: Uint8Array | ArrayBuffer,
    _algo: { name: "AES-CBC" },
    _extractable: boolean,
    _usages: string[]
  ): Promise<SubtleKey> {
    return { _rawKey: toUint8(keyData) };
  },

  async decrypt(
    algo: { name: "AES-CBC"; iv: Uint8Array | ArrayBuffer },
    key: SubtleKey,
    data: Uint8Array | ArrayBuffer
  ): Promise<ArrayBuffer> {
    const iv = toUint8(algo.iv);
    const ciphertext = toUint8(data);
    const mode = new aesjs.ModeOfOperation.cbc(key._rawKey, iv);
    const decrypted = mode.decrypt(ciphertext);
    // WebCrypto's AES-CBC always assumes PKCS#7 padding and strips it;
    // match that so callers get the plaintext, not padding bytes.
    const stripped = aesjs.padding.pkcs7.strip(decrypted);
    return toArrayBuffer(stripped);
  },

  async encrypt(
    algo: { name: "AES-CBC"; iv: Uint8Array | ArrayBuffer },
    key: SubtleKey,
    data: Uint8Array | ArrayBuffer
  ): Promise<ArrayBuffer> {
    const iv = toUint8(algo.iv);
    const plaintext = aesjs.padding.pkcs7.pad(toUint8(data));
    const mode = new aesjs.ModeOfOperation.cbc(key._rawKey, iv);
    return toArrayBuffer(mode.encrypt(plaintext));
  },

  async digest(
    algo: "SHA-256" | { name: "SHA-256" },
    data: Uint8Array | ArrayBuffer
  ): Promise<ArrayBuffer> {
    const algoName = typeof algo === "string" ? algo : algo.name;
    if (algoName !== "SHA-256") {
      throw new Error(`sandboxSubtle.digest: unsupported algorithm "${algoName}" (only SHA-256 is implemented).`);
    }
    const hex = await ExpoCrypto.digestStringAsync(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      // expo-crypto's digestStringAsync takes a string; feed it the raw
      // bytes reinterpreted as a binary string so byte-for-byte hashing
      // matches WebCrypto's ArrayBuffer-based digest.
      bytesToBinaryString(toUint8(data)),
      { encoding: ExpoCrypto.CryptoEncoding.HEX }
    );
    return toArrayBuffer(hexToBytes(hex));
  },
};

function toUint8(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function sandboxRandomUUID(): Promise<string> {
  return ExpoCrypto.randomUUID();
}

export const sandboxCryptoGlobals = {
  subtle: sandboxSubtle,
  randomUUID: sandboxRandomUUID,
};

export { bytesToBase64, base64ToBytes };
