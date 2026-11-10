import React from 'react';
import { ExternalLink } from 'lucide-react';

export const VERCEL_TOKENS_URL = 'https://vercel.com/account/settings/tokens';

/** The exact steps for creating a Vercel access token, shown wherever PotHub asks for one. */
export default function TokenGuide({ scopeName = '' }) {
  return (
    <ol className="vx-guide" aria-label="How to create a Vercel access token">
      <li>Tap <a href={VERCEL_TOKENS_URL} target="_blank" rel="noreferrer">Open Vercel’s tokens page <ExternalLink size={13} aria-hidden="true" /></a> and sign in if asked.</li>
      <li>Type a name such as <strong>PotHub</strong>.</li>
      <li>Under <strong>Scope</strong>, choose <strong>All projects</strong>{scopeName ? <> (the account or team <strong>{scopeName}</strong>)</> : <> (the account or team that owns your projects)</>}.</li>
      <li>Tap <strong>Create</strong>, then copy the token straight away. Vercel shows it only once.</li>
      <li>Come back here, paste it below and tap <strong>Save token</strong>.</li>
    </ol>
  );
}
