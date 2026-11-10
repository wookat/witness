import { createWriteStream, readFileSync, writeFileSync, type WriteStream } from "node:fs";
import { join } from "node:path";

export class AudioSink {
  private stream: WriteStream | null = null;
  readonly path: string;
  private gotData = false;

  constructor(dir: string) {
    this.path = join(dir, "audio.webm");
  }

  private pending = 0;

  chunk(b64: string) {
    if (!this.stream) this.stream = createWriteStream(this.path);
    this.pending++;
    this.stream.write(Buffer.from(b64, "base64"), () => this.pending--);
    this.gotData = true;
  }

  get hasAudio() { return this.gotData; }

  async close() {
    if (this.stream) await new Promise(r => this.stream!.end(r)); // end() flushes pending writes
  }
}

/** EBML vint: n-byte size field encodes values < 2^(7n)-1 */
function vintEncode(n: number): { bytes: Buffer; width: number } {
  for (let w = 1; w <= 8; w++) {
    if (n < (1 << (7 * w)) - 1) {
      const b = Buffer.alloc(w);
      b.writeUIntBE(n | (1 << (7 * w)), 0, w);
      return { bytes: b, width: w };
    }
  }
  throw new Error("vint overflow");
}
function vintRead(buf: Buffer, off: number): { value: number; width: number } {
  const first = buf[off];
  let w = 1;
  while (w <= 8 && !(first & (1 << (8 - w)))) w++;
  return { value: buf.readUIntBE(off, w) - (1 << (7 * w)), width: w }; // strip the length-marker bit
}

/**
 * MediaRecorder streams chunks without a Duration element, so the finished
 * webm reports duration=Infinity and seeks fail. Splice a Duration element
 * (0x4489, 8-byte double, ms) into the Info section (0x1549A966) and enlarge
 * its size vint. The Segment header uses unknown-size so no other offsets
 * need patching — everything after the insertion point shifts byte-for-byte.
 */
export function makeAudioSeekable(path: string, durationMs: number): void {
  try {
    const buf = readFileSync(path);
    const infoOff = buf.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]), 0);
    if (infoOff < 0) return;
    const size = vintRead(buf, infoOff + 4);
    const infoEnd = infoOff + 4 + size.width + size.value;
    const durOff = buf.indexOf(Buffer.from([0x44, 0x89]), infoOff);
    if (durOff >= 0 && durOff < infoEnd) {
      buf.writeDoubleBE(durationMs, durOff + 3); // patch existing Duration in place
      writeFileSync(path, buf);
      return;
    }
    const payload = Buffer.alloc(11); // Duration element: id(2) + size(1) + float64(8)
    payload.writeUInt16BE(0x4489, 0);
    payload[2] = 0x88;
    payload.writeDoubleBE(durationMs, 3);
    const newSize = vintEncode(size.value + payload.length);
    // replace: [Info id][newSize vint] + [old payload start .. end] with spliced duration appended inside Info
    const contentOff = infoOff + 4 + size.width;
    const out = Buffer.concat([
      buf.subarray(0, infoOff + 4),
      newSize.bytes,
      buf.subarray(contentOff, contentOff + size.value),
      payload,
      buf.subarray(contentOff + size.value),
    ]);
    writeFileSync(path, out);
  } catch { /* keep the raw file — better unseekable than missing */ }
}
