'use client';
import { useEffect, useRef } from 'react';

/**
 * A bottom sheet on phones, a centred card on desktop.
 * `dismissible={false}` hides the close button and ignores Escape and backdrop taps:
 * the only way out is the action in the footer.
 */
export default function Sheet({
  open,
  onClose,
  title,
  kicker,
  children,
  footer,
  size = 'md',
  className = '',
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  kicker?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'full';
  className?: string;
  dismissible?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => dismissible && e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissible]);
  if (!open) return null;
  return (
    <div className={'scrim' + (dismissible ? '' : ' locked')} onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} className={`sheet2 ${size} ${className}`} role="dialog" aria-modal="true">
        {dismissible && <div className="sheet2-grab" aria-hidden="true" />}
        {dismissible && <button className="sheet2-close" onClick={onClose} aria-label="Close">×</button>}
        {(kicker || title) && (
          <header className="sheet2-head">
            {kicker && <div className="kicker">{kicker}</div>}
            {title && <h3>{title}</h3>}
          </header>
        )}
        <div className="sheet2-body">{children}</div>
        {footer && <div className="sheet2-foot">{footer}</div>}
      </div>
    </div>
  );
}
