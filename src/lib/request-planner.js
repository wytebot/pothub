/** Deterministic intent classification and capability plan primitives shared by the server and tests.
 * The planner never invents a provider/model. It only maps intent to explicitly configured task agents.
 */
const TASK_ALIASES = Object.freeze({ text: 'text', code: 'code', image: 'image', video: 'video', audio: 'audio', file: 'file', document: 'file', spreadsheet: 'data', data: 'data', search: 'web-search', 'web-search': 'web-search', vision: 'vision-input', 'vision-input': 'vision-input' });
export function classifyRequestIntent({ prompt = '', mode = '', attachments = [] } = {}) {
  const text = String(prompt || '').toLowerCase();
  const caps = new Set();
  const explicitMode = TASK_ALIASES[String(mode || '').toLowerCase()];
  if (explicitMode) caps.add(explicitMode);
  const files = Array.isArray(attachments) ? attachments : [];
  for (const file of files) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if (type.startsWith('image/')) caps.add('vision-input');
    else if (type.startsWith('video/')) caps.add('video');
    else if (type.startsWith('audio/')) caps.add('audio');
    else if (/\.(csv|xlsx?|ods|tsv)$/.test(name) || /spreadsheet|csv/.test(type)) caps.add('data');
    else if (file) caps.add('file');
  }
  if (/\b(draw|paint|illustrat(?:e|ion)|generate|create|make|render)\b.{0,100}\b(image|picture|photo|artwork|poster|logo|thumbnail|wallpaper)\b|\b(image|picture|poster|logo)\s*:/i.test(text) || /^\s*(draw|paint|illustrate)\s+(?:me\s+)?(?:a|an|the)\s+\w+/i.test(text) || /\b(generate|create|make|render)\b.{0,70}\b(visual|graphic|art|cover|icon)\b/i.test(text)) caps.add('image');
  if (/\b(generate|make|create|render|edit)\b.{0,100}\b(video|animation|clip|movie)\b|\bvideo\s*:/i.test(text) || /^\s*(make|create|generate)\s+(?:me\s+)?(?:a|an|the)\s+\w+\s+(?:video|animation|clip)/i.test(text)) caps.add('video');
  if (/\b(transcribe|speech to text|text to speech|generate audio|make music|voiceover|audio file)\b/i.test(text)) caps.add('audio');
  if (/\b(search the web|web search|look up current|browse the web|latest sources)\b/i.test(text)) caps.add('web-search');
  if (/\b(export|download|save|deliver|give|return)\b.{0,60}\b(zip|pdf|docx?|xlsx?|csv|json|html|svg|png|jpe?g|webp|mp3|wav|mp4|webm|file)\b|\.(pdf|docx?|xlsx?|csv|json|html|svg|png|jpe?g|webp|mp3|wav|mp4|webm|zip)\b/i.test(text)) caps.add(/\b(xlsx?|csv|spreadsheet)\b/i.test(text) ? 'data' : 'file');
  if (/\b(code|program|function|script|debug|refactor|implement|build (?:an app|a landing page|a website|a page)|write a class|typescript|javascript|python)\b/i.test(text)) caps.add('code');
  if (caps.has('vision-input')) caps.add('text');
  if (!caps.size) caps.add('text');
  // If a request combines outputs, preserve them all; plain text is implicit support material, not a separate agent.
  if (caps.size > 1) caps.add('text');
  return [...caps];
}
export function planConfiguredAgents(capabilities, agents = [], workspace = 'developer') {
  const scope = workspace === 'creator' ? 'creator' : 'developer';
  const steps = [], missing = [];
  for (const capability of [...new Set(capabilities || [])]) {
    const candidates = (Array.isArray(agents) ? agents : []).filter(a => {
      const task = String(a?.task || a?.function || '').toLowerCase();
      const agentScope = String(a?.workspace || a?.ownerScope || 'developer').toLowerCase();
      return agentScope === scope && task === capability && a?.id && a?.provider && a?.model && a?.keyPresent === true && Array.isArray(a?.capabilities) && a.capabilities.includes(capability) && a?.modelVerified === true;
    });
    if (!candidates.length) missing.push(capability);
    else steps.push({ capability, agentId: candidates[0].id, provider: candidates[0].provider, model: candidates[0].model, inputs: [], expectedOutput: capability === 'image' ? 'image-bytes' : capability === 'video' ? 'video-file' : capability === 'file' ? 'downloadable-file' : capability === 'data' ? 'structured-data-or-spreadsheet' : 'validated-content' });
  }
  return { workspace: scope, steps, missing, ready: missing.length === 0 };
}
