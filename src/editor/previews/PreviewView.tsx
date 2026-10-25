import type { Preview } from '../../blocks/types';
import { AudioPlayer } from './AudioPlayer';
import { SpectrumChart, WaveformChart } from './Charts';
import { SpectrogramView } from './SpectrogramView';

export function PreviewView({ preview }: { preview: Preview }) {
  switch (preview.kind) {
    case 'info':
      return (
        <dl className="info">
          {preview.rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      );
    case 'waveform':
      return <WaveformChart preview={preview} />;
    case 'spectrum':
      return <SpectrumChart preview={preview} />;
    case 'spectrogram':
      return <SpectrogramView preview={preview} />;
    case 'audio':
      return <AudioPlayer preview={preview} />;
  }
}
