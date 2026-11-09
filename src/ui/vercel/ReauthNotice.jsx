import React from 'react';
import { ShieldCheck } from 'lucide-react';

/** Shown when Vercel refuses an action that needs the person to confirm it is them. Vercel does the verification itself. */
export default function ReauthNotice({ onReauthorize, detail }) {
  return (
    <div className="vx-notice warn" role="alert">
      <ShieldCheck size={20} aria-hidden="true" />
      <div>
        <strong>Vercel needs you to confirm this</strong>
        <p>{detail || 'Vercel protects sensitive actions. Reauthorize PotHub on Vercel; if Vercel emails you a verification code, enter it on Vercel’s page, then come back and try again.'}</p>
        <button type="button" className="primary" onClick={onReauthorize}>Reauthorize Vercel</button>
      </div>
    </div>
  );
}
