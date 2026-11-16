export function Support() {
  const email = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  return (
    <section className="page">
      <h1>Support</h1>
      <div className="panel">
        {email ? <p>Email <a href={`mailto:${email}`}>{email}</a>. Include your payment reference for billing questions.</p>
          : <p className="muted">No support address is configured in this build. Set VITE_SUPPORT_EMAIL before launch.</p>}
        <p className="muted small">Never send your API keys to anyone, including support.</p>
      </div>
    </section>
  );
}
