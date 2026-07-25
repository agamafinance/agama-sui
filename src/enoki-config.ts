// "Sign in with Google" (zkLogin via Mysten Enoki).
// These two values are PUBLIC (frontend-safe) — they are meant to live in the
// client. Fill them to enable the Google button in the connect modal.
//
// 1) ENOKI_API_KEY  → portal.enoki.mystenlabs.com → create app → copy the
//    PUBLIC key (starts with `enoki_public_...`). Whitelist http://localhost:5178.
// 2) GOOGLE_CLIENT_ID → Google Cloud Console → APIs & Services → Credentials →
//    Create OAuth client ID → Web application →
//      Authorized JavaScript origins:  http://localhost:5178
//      Authorized redirect URIs:       http://localhost:5178
//    Then paste that same Client ID into the Google provider in the Enoki portal.
//
// Leave empty to keep only wallet connect (Slush). No crash if unset.
export const ENOKI_API_KEY = "enoki_public_a8425c0c9c88906c459e60881048d00f";
export const GOOGLE_CLIENT_ID = "502362903917-59hn44ihigvg644jug0empog8ml6ns3d.apps.googleusercontent.com";
