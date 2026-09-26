export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export const IMAGE_EXTENSION: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Identify an image by its magic bytes, never by the filename or the
 * browser-supplied Content-Type — both of which the client controls. An
 * executable renamed to .jpg fails here.
 */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12) {
    const head = String.fromCharCode(...bytes.subarray(0, 4));
    const kind = String.fromCharCode(...bytes.subarray(8, 12));
    if (head === "RIFF" && kind === "WEBP") return "image/webp";
  }
  return null;
}

/** Shared wording so both upload routes reject files the same way. */
export const IMAGE_REJECTION =
  "That file is not a JPG, PNG or WebP image. Screenshots and photos from your phone both work.";

export function oversizeMessage(size: number): string {
  return `That image is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB — try a smaller version.`;
}
