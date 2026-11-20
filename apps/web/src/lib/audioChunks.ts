// Cuts a big audio/video file into 16 kHz mono WAV pieces in the browser, so each
// piece fits a speech-to-text engine's upload limit (e.g. 25MB). 8 minutes of
// 16 kHz / 16-bit mono is ~15MB. Decoding is done by the browser, so any format
// it can play works (m4a, mp3, mp4, webm, wav…). Very large files may exhaust memory:
// the caller shows the error and suggests uploading the audio-only file.
export const CHUNK_SECONDS = 8 * 60;
const RATE = 16000;

function wav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export async function cutIntoChunks(file: Blob, onProgress?: (done: number, total: number) => void): Promise<Array<{ blob: Blob; offset: number }>> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: RATE });
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("הדפדפן לא הצליח לפענח את הקובץ (גדול מדי או פורמט לא נתמך). נסו להעלות את קובץ האודיו בלבד (m4a/mp3)");
  } finally {
    ctx.close().catch(() => {});
  }
  // Mix down to mono.
  const mono = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  const size = CHUNK_SECONDS * RATE;
  const total = Math.max(1, Math.ceil(mono.length / size));
  const out: Array<{ blob: Blob; offset: number }> = [];
  for (let i = 0; i < total; i++) {
    out.push({ blob: wav(mono.subarray(i * size, (i + 1) * size)), offset: i * CHUNK_SECONDS });
    onProgress?.(i + 1, total);
  }
  return out;
}
