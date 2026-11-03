/**
 * Build a bounded BYOK fallback sequence. The default agent is considered first,
 * but its fallback models must not starve other configured API keys. Candidate
 * order is round-robin by model preference: each agent's primary model first,
 * then each agent's first fallback, then each agent's second fallback, etc.
 * Every model stays paired with the API key and endpoint saved on that agent.
 */
export function interleaveAgentCandidates(agents, limit = 8) {
  const max = Math.max(1, Math.min(32, Number(limit) || 8));
  const normalized = (Array.isArray(agents) ? agents : []).map((agent) => ({
    ...agent,
    models: [...new Set((Array.isArray(agent.models) ? agent.models : [agent.model])
      .map((model) => String(model || '').trim()).filter(Boolean))].slice(0, 8),
  })).filter((agent) => {
    const task = String(agent.task || '').trim().toLowerCase();
    // Legacy 'all' or unscoped agents are not valid fallbacks. A credential is
    // eligible only for the exact task it was saved for.
    return String(agent.key || '').trim() && agent.models.length && String(agent.provider || '').trim() && task && task !== 'all';
  });
  const result = [];
  const seen = new Set();
  const maxModels = Math.max(0, ...normalized.map(agent => agent.models.length));
  for (let modelIndex = 0; modelIndex < maxModels && result.length < max; modelIndex++) {
    for (const agent of normalized) {
      if (result.length >= max) break;
      const model = agent.models[modelIndex];
      if (!model) continue;
      const identity = `${agent.provider}\u0000${agent.baseUrl || ''}\u0000${agent.key}\u0000${model}\u0000${agent.task || ''}\u0000${agent.workspace || 'developer'}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push({ key: agent.key, model, provider: agent.provider, baseUrl: agent.baseUrl || '', task: agent.task, workspace: String(agent.workspace || 'developer').toLowerCase() === 'creator' ? 'creator' : 'developer' });
    }
  }
  return result;
}

/**
 * Build a fallback sequence only from agents explicitly configured for the same task.
 * `extra` is intentionally ignored: cross-task fallback is a root cause of wrong-model
 * calls (e.g. Prompt Guard being tried for chat). A caller must pass a task-homogeneous
 * candidate list. Every candidate remains bound to its own provider, key and endpoint.
 */
export function buildFallbackSequence(primary, _extra = [], limit = 8) {
  return interleaveAgentCandidates(primary, limit);
}
