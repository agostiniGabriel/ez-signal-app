/** Decoded PCM audio, one Float32Array per channel with samples in [-1, 1]. */
export interface PcmAudio {
  sampleRate: number;
  channels: Float32Array[];
}

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_FLOAT = 3;
const WAVE_FORMAT_ALAW = 6;
const WAVE_FORMAT_MULAW = 7;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

/** Names for compressed encodings that turn up inside WAV files, for error messages. */
const FORMAT_NAMES: Record<number, string> = {
  2: 'Microsoft ADPCM',
  0x11: 'IMA ADPCM',
  0x31: 'GSM 6.10',
  0x50: 'MPEG audio',
  0x55: 'MP3',
};

/** Thrown for valid WAV files whose encoding this parser can't read (the browser's decoder may still read it). */
export class UnsupportedWavEncoding extends Error {}

const tag = (view: DataView, offset: number) =>
  String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));

/**
 * Parses a RIFF/WAVE file at its native sample rate.
 * Supports integer PCM (8/16/24/32-bit containers, any valid bit depth), IEEE float (32/64-bit),
 * G.711 μ-law and A-law, including WAVE_FORMAT_EXTENSIBLE.
 */
export function parseWav(buffer: ArrayBuffer): PcmAudio {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || tag(view, 0) !== 'RIFF' || tag(view, 8) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }

  let format = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;
  let data: { offset: number; length: number } | undefined;

  for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
    const id = tag(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      blockAlign = view.getUint16(body + 12, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (format === WAVE_FORMAT_EXTENSIBLE && size >= 26) format = view.getUint16(body + 24, true);
    } else if (id === 'data') {
      // Streaming writers may leave the size as 0 or 0xFFFFFFFF; then the data runs to the end of the file.
      const rest = buffer.byteLength - body;
      data = { offset: body, length: size === 0 ? rest : Math.min(size, rest) };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (!data || channelCount === 0) throw new Error('WAV file is missing its fmt or data chunk');
  // Samples sit in byte-aligned containers (e.g. 20-bit audio in 3 bytes), so read by container size.
  const bytesPerSample = blockAlign > 0 ? blockAlign / channelCount : Math.ceil(bitsPerSample / 8);
  const read = sampleReader(view, format, bytesPerSample * 8, bitsPerSample);
  const frameCount = Math.floor(data.length / (bytesPerSample * channelCount));
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
  for (let i = 0, offset = data.offset; i < frameCount; i++) {
    for (let c = 0; c < channelCount; c++, offset += bytesPerSample) channels[c][i] = read(offset);
  }
  return { sampleRate, channels };
}

/** ITU-T G.711 μ-law byte to a 16-bit linear sample. */
export function mulawToLinear(byte: number): number {
  const u = ~byte & 0xff;
  const exponent = (u >> 4) & 0x07;
  const magnitude = ((((u & 0x0f) << 3) + 0x84) << exponent) - 0x84;
  return u & 0x80 ? 0 - magnitude : magnitude; // 0 - 0 is +0, unlike -0

}

/** ITU-T G.711 A-law byte to a 16-bit linear sample. */
export function alawToLinear(byte: number): number {
  const a = byte ^ 0x55;
  const exponent = (a >> 4) & 0x07;
  const mantissa = a & 0x0f;
  const magnitude = exponent === 0 ? (mantissa << 4) + 8 : ((mantissa << 4) + 0x108) << (exponent - 1);
  return a & 0x80 ? magnitude : -magnitude;
}

const tableFrom = (decode: (byte: number) => number) => Float32Array.from({ length: 256 }, (_, b) => decode(b) / 32768);

function sampleReader(view: DataView, format: number, containerBits: number, bits: number): (offset: number) => number {
  if (format === WAVE_FORMAT_FLOAT && containerBits === 32) return (o) => view.getFloat32(o, true);
  if (format === WAVE_FORMAT_FLOAT && containerBits === 64) return (o) => view.getFloat64(o, true);
  if (format === WAVE_FORMAT_MULAW || format === WAVE_FORMAT_ALAW) {
    const table = tableFrom(format === WAVE_FORMAT_MULAW ? mulawToLinear : alawToLinear);
    return (o) => table[view.getUint8(o)];
  }
  if (format === WAVE_FORMAT_PCM) {
    switch (containerBits) {
      case 8:
        return (o) => (view.getUint8(o) - 128) / 128;
      case 16:
        return (o) => view.getInt16(o, true) / 32768;
      case 24:
        return (o) => ((view.getInt8(o + 2) << 16) | view.getUint16(o, true)) / 8388608;
      case 32:
        return (o) => view.getInt32(o, true) / 2147483648;
    }
  }
  const name = FORMAT_NAMES[format] ?? (format === WAVE_FORMAT_PCM ? `${bits}-bit PCM` : `format code 0x${format.toString(16)}`);
  throw new UnsupportedWavEncoding(`${name} WAV files aren't supported. Re-save it as 16-bit PCM WAV.`);
}

/** Encodes audio as 16-bit PCM WAV; samples outside [-1, 1] are clipped. */
export function encodeWav({ sampleRate, channels }: PcmAudio): ArrayBuffer {
  const frameCount = channels[0]?.length ?? 0;
  const blockAlign = channels.length * 2;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeTag = (offset: number, value: string) =>
    [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));

  writeTag(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, WAVE_FORMAT_PCM, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeTag(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0, offset = 44; i < frameCount; i++) {
    for (const channel of channels) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(offset, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
      offset += 2;
    }
  }
  return buffer;
}
