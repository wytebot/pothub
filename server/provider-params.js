export function openAiRequestParams({provider='openai-compatible',model='',maxTokens=1024,jsonMode=false}={}){
  const reasoning=/^(?:o[134]|gpt-5)/i.test(String(model));
  const params=reasoning?{max_completion_tokens:maxTokens}:{max_tokens:maxTokens,temperature:0.2};
  const formatProvider=['openai','openrouter'].includes(String(provider).toLowerCase());
  if(jsonMode&&formatProvider&&!reasoning)params.response_format={type:'json_object'};
  return params;
}
