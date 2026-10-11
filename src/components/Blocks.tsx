import type { Block, Cell } from '@/lib/caseSchema';
import { Fragment } from 'react';

function CellView({ c }: { c: Cell }) {
  if (typeof c === 'string') return <>{c}</>;
  return <span className={c.tone}>{c.v}</span>;
}

/** Renders evidence blocks as text. Case content never becomes HTML. */
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'note') return <p key={i} className="foot">{b.text}</p>;
        if (b.type === 'quote')
          return (
            <p key={i} className="quote">
              {b.text}
              <span>{b.source}</span>
            </p>
          );
        return (
          <div key={i} className="tbl">
            <table>
              <thead>
                <tr>{b.columns.map((h, j) => <th key={j}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>{r.map((c, k) => <td key={k}><CellView c={c} /></td>)}</tr>
                ))}
                {b.total && (
                  <tr className="total">{b.total.map((c, k) => <td key={k}><CellView c={c} /></td>)}</tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

/** Tiny **bold** markup for explanation copy, rendered without innerHTML. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
