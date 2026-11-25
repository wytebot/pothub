export function Support() {
  const email = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
  return (
    <section className="page">
      <h1>Support</h1>
      <div className="panel">
        {email ? <p>Email <a href={`mailto:${email}`}>{email}</a>. Describe the issue you encountered and include the app version if possible.</p>
          : <p className="muted">Support contact details are not available right now. Please check back soon.</p>}
        <p className="muted small">Never send your API keys to anyone, including support.</p>
      </div>
    </section>
  );
}
