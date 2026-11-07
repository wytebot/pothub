/** Data-driven answer styles and a single-pass constraint validator. User content remains untrusted. */
import { DEBUG_STYLE_EXTRA } from './engineering-protocol.js';
export const RESPONSE_STYLES = [
  {id:'summarize',test:/\b(?:summari[sz]e|summary|tldr|tl;dr|key takeaways|main points)\b/i,fragment:'Summarize faithfully: lead with the central point, preserve important qualifications and numbers, and do not add facts absent from the source.'},
  {id:'translate',test:/\b(?:translate|translation|in Yoruba|in Spanish|in French|in Arabic|in Hindi|in Igbo|in Hausa|in Swahili|in Chinese|in Japanese|in Korean|in Russian|in Turkish)\b/i,fragment:'Translate into the requested target language while preserving meaning, names, structure, Markdown, lists, and table layout. Ask a question only if the source or target language is genuinely ambiguous.'},
  {id:'rewrite',test:/\b(?:rewrite|proofread|make it shorter|make it formal|make it friendly|make it persuasive|polish this|improve the wording)\b/i,fragment:'Provide the revised text first. Preserve the intended meaning; apply the requested tone and length, and avoid a long explanation unless requested.'},
  {id:'explain',test:/\b(?:explain like i(?:'m| am) new|explain like i(?:'m| am) five|step by step|walk me through|explain simply)\b/i,fragment:'Explain in an accessible sequence, define unfamiliar terms briefly, and use a concrete example when helpful. Do not talk down to the reader.'},
  {id:'compare',test:/\b(?:compare|pros and cons|advantages and disadvantages|versus|\bvs\.?\b)\b/i,fragment:'Compare on explicit criteria, distinguish facts from judgment, and give a concise recommendation only when the available evidence supports one.'},
  {id:'debug',test:/\b(?:debug|fix the bug|review my code|debug this error|stack trace|runtime error)\b/i,fragment:'Start from the evidence in the request (the first error, what the code shows), separate evidence from hypothesis, then name the most likely cause, then give a minimal fix and a verification step. Never claim code was executed unless a tool actually ran it. '+DEBUG_STYLE_EXTRA},
  {id:'table',test:/\b(?:make a table|tabulate|as a table)\b/i,fragment:'Return a clean Markdown table with concise, consistently formatted cells. Do not force unrelated prose into table cells.'},
  {id:'checklist',test:/\b(?:checklist|to-do list|tick list)\b/i,fragment:'Use actionable checklist items, ordered by dependency or priority where appropriate.'},
  {id:'schedule',test:/\b(?:schedule|timetable|study plan|work plan|timeline)\b/i,fragment:'Use a practical schedule with time or date assumptions stated explicitly. Do not invent fixed dates when none were supplied.'},
  {id:'email',test:/\b(?:write|draft|compose).{0,30}\b(?:email|e-mail|message)\b/i,fragment:'Write a ready-to-send email with a clear subject when appropriate, suitable greeting, concise body, and professional sign-off. Do not invent recipient addresses.'},
  {id:'cover-letter',test:/\bcover letter\b/i,fragment:'Produce a tailored, ready-to-edit cover letter. Do not invent experience, qualifications, employers, or achievements not supplied by the user.'},
  {id:'report',test:/\b(?:write|prepare|create|draft).{0,25}\breport\b/i,fragment:'Use a clear report structure with purpose, key findings, supporting detail, limitations, and next steps as appropriate. Label assumptions.'},
  {id:'fact-check',test:/\b(?:fact.check|verify|is it true|check this claim|validate this)\b/i,fragment:'Separate verified facts, unsupported claims, and uncertainty. When configured search results are available, cite sources. Never fabricate citations or imply live verification without evidence.'},
  {id:'continue',test:/\b(?:continue|expand|redo|try again|keep going|make another version)\b/i,fragment:'Continue the prior task using the available conversation context and attachments. Preserve established requirements and change only what the user asks to change.'}
];
export function responseStyleFragment(prompt='') { const styles=RESPONSE_STYLES.filter(s=>s.test.test(String(prompt)));return styles.map(s=>s.fragment).join(' '); }
export function responseConstraintIssues(prompt='',answer='',format='') {
  const p=String(prompt||''),a=String(answer||'').trim(),issues=[];
  const max=p.match(/\b(?:under|less than|at most|no more than)\s+(\d{1,5})\s+words?\b/i);
  if(max&&a.split(/\s+/).filter(Boolean).length>Number(max[1]))issues.push(`Keep the answer under ${max[1]} words.`);
  const bullets=p.match(/\b(?:in|exactly|give me|provide)\s+(\d{1,2})\s+(?:bullets?|bullet points?)\b/i)||p.match(/\b(\d{1,2})\s+bullet points?\b/i);
  if(bullets){const count=(a.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm)||[]).length;if(count!==Number(bullets[1]))issues.push(`Return exactly ${bullets[1]} bullet points.`)}
  if(format==='json'||/\bas JSON\b/i.test(p)){let candidate=a.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();try{JSON.parse(candidate)}catch{issues.push('Return syntactically valid JSON only, with no prose outside the JSON value.')}}
  if(format==='csv'&&!/```csv[\s\S]*```/i.test(a)&&!/^\s*[^\n,]+,[^\n]+/m.test(a))issues.push('Return valid CSV with a header row.');
  return issues;
}
