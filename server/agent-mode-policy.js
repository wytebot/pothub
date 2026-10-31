export function normalizeDeveloperAgentMode(value) {
  return value === 'own' ? 'own' : 'pothub';
}

export function chooseOperationAgents({ workspace = 'developer', mode = 'pothub', candidates = [] } = {}) {
  const available = Array.isArray(candidates) ? candidates : [];
  if (workspace === 'creator') return { mode: available.length ? 'own' : 'pothub', candidates: available };
  const selected = normalizeDeveloperAgentMode(mode);
  if (selected === 'pothub') return { mode: 'pothub', candidates: [] };
  if (!available.length) {
    const error = new Error('Own agent mode is selected, but no working agent is configured for this task. Open API & Agents and add one, or switch to Pothub AI in Settings.');
    error.status = 409;
    error.code = 'AGENT_NOT_CONFIGURED';
    throw error;
  }
  return { mode: 'own', candidates: available };
}
