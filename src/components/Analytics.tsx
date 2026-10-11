import Script from 'next/script';

/** Root Cause's Clarity project. Public by design (it ships in every page); override with NEXT_PUBLIC_CLARITY_ID. */
const DEFAULT_CLARITY_ID = 'yw291uw8mq';

/**
 * Microsoft Clarity (session recordings + heatmaps), injected into every page.
 * Runs only on production builds so local development doesn't pollute the data.
 */
export default function Analytics() {
  if (process.env.NODE_ENV !== 'production') return null;
  const id = (process.env.NEXT_PUBLIC_CLARITY_ID || DEFAULT_CLARITY_ID).trim();
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  return (
    <Script id="clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`}
    </Script>
  );
}
