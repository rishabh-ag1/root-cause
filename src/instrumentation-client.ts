import posthog from 'posthog-js';

/** Root Cause's PostHog project (US cloud). The project key is public by design; override with NEXT_PUBLIC_POSTHOG_KEY. */
const DEFAULT_POSTHOG_KEY = 'phc_CbW7WgK4gBkEWdecpd2iGDuo8srDAWxcEY7G4kq8vagE';

// Production only, so local development doesn't pollute DAU/retention numbers.
if (process.env.NODE_ENV === 'production') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY || DEFAULT_POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2025-05-24', // pageviews + pageleaves on client-side navigation
    person_profiles: 'identified_only',
    disable_session_recording: true, // Clarity handles recordings
    mask_all_text: false,
    autocapture: { element_allowlist: ['a', 'button'] }, // never inputs: no emails or codes
  });
}
