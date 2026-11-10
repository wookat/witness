import { readFileSync } from "node:fs";
import { chromium } from "playwright";

/**
 * Decode audio.webm → 16kHz mono WAV via Chromium's decodeAudioData.
 * Playwright is already a dependency — zero new native deps, and Chromium
 * is the exact same decoder the review page uses.
 */
export async function webmToWav(path: string): Promise<Buffer> {
  const buf = readFileSync(path);
  const b = await chromium.launch();
  try {
    const page = await b.newPage();
    const pcm16 = await page.evaluate(async (b64) => {
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const ctx = new OfflineAudioContext(1, 1, 16000);
      const src = await ctx.decodeAudioData(raw);
      const off = new OfflineAudioContext(1, Math.ceil(src.duration * 16000), 16000);
      const node = off.createBufferSource();
      node.buffer = src; node.connect(off.destination); node.start();
      const out = await off.startRendering();
      const f32 = out.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      let bin = "";
      const u8 = new Uint8Array(i16.buffer);
      for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
      return btoa(bin);
    }, buf.toString("base64"));
    const pcm = Buffer.from(pcm16, "base64");
    const n = pcm.length;
    const wav = Buffer.alloc(44 + n);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + n, 4); wav.write("WAVE", 8);
    wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(n, 40);
    pcm.copy(wav, 44);
    return wav;
  } finally {
    await b.close();
  }
}
