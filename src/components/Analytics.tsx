import Script from 'next/script';

/** Root Cause's Clarity project. Public by design (it ships in every page); override with NEXT_PUBLIC_CLARITY_ID. */
const DEFAULT_CLARITY_ID = 'yw291uw8mq';

/**
 * Microsoft Clarity (session recordings + heatmaps) and, when NEXT_PUBLIC_GA_ID is set, Google Analytics 4,
 * injected into every page. Runs only on production builds so local development doesn't pollute the data.
 */
export default function Analytics() {
  if (process.env.NODE_ENV !== 'production') return null;
  const id = (process.env.NEXT_PUBLIC_CLARITY_ID || DEFAULT_CLARITY_ID).trim();
  const ga = (process.env.NEXT_PUBLIC_GA_ID || '').trim();
  const clarityOk = /^[a-z0-9]+$/i.test(id);
  const gaOk = /^G-[A-Z0-9]+$/i.test(ga);
  // The id must not be "clarity": element ids become window properties and would shadow window.clarity.
  return (
    <>
      {clarityOk && (
        <Script id="ms-clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`}
        </Script>
      )}
      {gaOk && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
    </>
  );
}
