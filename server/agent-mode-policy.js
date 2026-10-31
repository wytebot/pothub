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
