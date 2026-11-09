export function normalizeDeveloperAgentMode(_value) {
  // Complete BYOK policy: platform-funded model routing is disabled.
  return 'own';
}

export function chooseOperationAgents({ workspace = 'developer', candidates = [] } = {}) {
  const available = Array.isArray(candidates) ? candidates : [];
  if (!available.length) {
    const error = new Error('No BYOK agent is configured for this task. Add a provider key and an active model in API & Agents. PotHub does not run platform-funded AI operations.');
    error.status = 409;
    error.code = 'AGENT_NOT_CONFIGURED';
    throw error;
  }
  return { mode: 'own', candidates: available };
}


/** A server-side saved agent belongs to exactly one execution mode. */
export function agentAllowedInMode(payload, mode = 'direct') {
  const isBackend = String(payload?.label || '') === 'Vercel Backend'
    && String(payload?.provider || '').toLowerCase().replace(/[_\s]+/g, '-') === 'openai-compatible';
  return String(mode || 'direct').toLowerCase() === 'backend' ? isBackend : !isBackend;
}


/** Client-supplied candidates are also constrained to the selected mode. */
export function transientAgentAllowedInMode(candidate, mode = 'direct') {
  const provider = String(candidate?.provider || '').toLowerCase().replace(/[_\s]+/g, '-');
  const key = String(candidate?.key || '').trim();
  const isBackendProxy = provider === 'openai-compatible' && key === 'pothub-proxy-env-key' && !!String(candidate?.keyEnv || '').trim();
  return String(mode || 'direct').toLowerCase() === 'backend' ? isBackendProxy : key !== 'pothub-proxy-env-key';
}
