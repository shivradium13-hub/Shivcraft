export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export type VideoType = "video/mp4" | "video/webm";

export const VIDEO_EXTENSION: Record<VideoType, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * Identify a video by its magic bytes, never by filename or the client-supplied
 * Content-Type. MP4/MOV files carry an `ftyp` box near the start; WebM/Matroska
 * start with the EBML signature. Anything else is rejected.
 */
export function sniffVideo(bytes: Uint8Array): VideoType | null {
  // ISO base media (MP4/MOV): bytes 4..8 spell "ftyp".
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  ) {
    return "video/mp4";
  }
  // WebM / Matroska: EBML header 1A 45 DF A3.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  return null;
}

export const VIDEO_REJECTION =
  "That file is not an MP4 or WebM video. Export a short clip in one of those formats.";

export function oversizeVideoMessage(size: number): string {
  return `That video is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is 50 MB — trim it or export a smaller version.`;
}
