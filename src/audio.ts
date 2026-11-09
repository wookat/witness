import { createWriteStream, type WriteStream } from "node:fs";
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
