import { useReactFlow } from '@xyflow/react';
import { blocks, categories } from '../blocks/registry';
import { useEditor } from './store';

export const BLOCK_MIME = 'application/x-ez-signal-block';

export function Palette() {
  const addBlock = useEditor((s) => s.addBlock);
  const { screenToFlowPosition } = useReactFlow();

  const addAtCentre = (type: string) => {
    const canvas = document.querySelector('.react-flow')!.getBoundingClientRect();
    const centre = screenToFlowPosition({ x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 3 });
    addBlock(type, { x: centre.x - 150, y: centre.y });
  };

  return (
    <aside className="palette">
      {categories.map((category) => (
        <section key={category.id}>
          <h2>{category.label}</h2>
          {blocks
            .filter((b) => b.category === category.id)
            .map((b) => (
              <button
                key={b.type}
                type="button"
                className={`palette__item palette__item--${b.category}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(BLOCK_MIME, b.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => addAtCentre(b.type)}
                title={b.description}
              >
                <strong>{b.title}</strong>
                <span>{b.description}</span>
              </button>
            ))}
        </section>
      ))}
      <p className="palette__hint">Drag blocks onto the canvas, or drop audio files on it. Everything runs in your browser.</p>
    </aside>
  );
}
