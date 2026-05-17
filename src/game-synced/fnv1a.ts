const FNV1A_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV1A_PRIME_32 = 0x01000193;
const HEX_PAD_WIDTH = 8;
const HEX_RADIX = 16;

/** Computes a 32-bit FNV-1a hash for the given UTF-16 string. */
export function fnv1a32(input: string): number {
  let hash = FNV1A_OFFSET_BASIS_32;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV1A_PRIME_32) >>> 0;
  }
  return hash >>> 0;
}

/** Hex string form of `fnv1a32`, zero-padded to a stable 8-character width. */
export function fnv1a32Hex(input: string): string {
  return fnv1a32(input).toString(HEX_RADIX).padStart(HEX_PAD_WIDTH, "0");
}
