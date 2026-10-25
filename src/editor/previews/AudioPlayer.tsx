import { useEffect, useRef, useState } from 'react';
import type { Preview } from '../../blocks/types';
import { encodeWav } from '../../dsp/wav';

let sharedContext: AudioContext | undefined;

export function AudioPlayer({ preview }: { preview: Extract<Preview, { kind: 'audio' }> }) {
  const [playing, setPlaying] = useState(false);
  const source = useRef<AudioBufferSourceNode>();
  const length = preview.channels[0]?.length ?? 0;
  const duration = length / preview.sampleRate;

  const stop = () => {
    source.current?.stop();
    source.current = undefined;
    setPlaying(false);
  };

  // Stop when the signal changes or the block is removed.
  useEffect(() => stop, [preview]);

  const play = async () => {
    sharedContext ??= new AudioContext();
    await sharedContext.resume();
    const buffer = sharedContext.createBuffer(preview.channels.length, Math.max(1, length), preview.sampleRate);
    preview.channels.forEach((c, i) => buffer.copyToChannel(c, i));
    const node = sharedContext.createBufferSource();
    node.buffer = buffer;
    node.connect(sharedContext.destination);
    node.onended = () => source.current === node && stop();
    node.start();
    source.current = node;
    setPlaying(true);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([encodeWav(preview)], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ez-signal.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="player nodrag">
      <button type="button" className="button button--primary" onClick={playing ? stop : play}>
        {playing ? '■ Stop' : '▶ Play'}
      </button>
      <button type="button" className="button" onClick={download}>
        Download WAV
      </button>
      <span className="muted">{duration.toFixed(2)} s</span>
    </div>
  );
}
