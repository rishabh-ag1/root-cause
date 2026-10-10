import { ImageResponse } from 'next/og';
import { getTodayCase } from '@/lib/repo';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = "Root Cause: today's business case";
export const revalidate = 600;

/** Link preview for LinkedIn / WhatsApp: today's case headline on a case-file card. */
export default async function OG() {
  let headline = 'One business mystery a day. Find the root cause.';
  let meta = 'THE DAILY BUSINESS CASE';
  try {
    const c = await getTodayCase();
    if (c) {
      headline = c.brief.headline;
      meta = `CASE #${c.case_number} · ${c.company.toUpperCase()}`;
    }
  } catch {}

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#e6dfcf', padding: 56, fontFamily: 'sans-serif' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#fbf8f1', border: '2px solid #cfc5ad', borderRadius: 8, padding: '52px 60px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -2, left: 60, width: 160, height: 12, background: '#b8322a' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 30, letterSpacing: 6, color: '#6c675b', fontWeight: 600 }}>{meta}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#b8322a', border: '5px solid #b8322a', padding: '6px 18px', borderRadius: 8, transform: 'rotate(-6deg)', letterSpacing: 4 }}>
              OPEN CASE
            </div>
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, color: '#1f2421', lineHeight: 1.05, letterSpacing: -1 }}>{headline}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 4, color: '#1f2421' }}>ROOT CAUSE</div>
            <div style={{ fontSize: 26, color: '#6c675b' }}>Can you crack it in fewer files than everyone else?</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
