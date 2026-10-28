function apiBase(){const native=!!window.Capacitor?.isNativePlatform?.();const configured=(import.meta.env.VITE_API_BASE_URL||localStorage.getItem('pothub_api_base')||localStorage.getItem('kithub_api_base')||'').replace(/\/$/,'');if(native&&!configured)throw new Error('Set your deployed API URL in Settings before using the standalone APK.');return configured?`${configured}/api`:'/api'}
export async function api(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};
  // BYOK credentials live in sessionStorage only and are sent only to the configured Pothub API.
  // They are never persisted by the API client or added to request bodies.
  try {
    const agent = sessionStorage.getItem('pothub_agent_config');
    if (agent) headers['X-Pothub-Agent-Config'] = btoa(unescape(encodeURIComponent(agent)));
    if (sessionStorage.getItem('pothub_use_agent') === 'true') headers['X-Pothub-Use-Agent'] = 'true';
  } catch { /* session storage can be unavailable in hardened browser contexts */ }if(window.Capacitor?.isNativePlatform?.()){const token=localStorage.getItem('pothub_native_session')||localStorage.getItem('kithub_native_session');if(token)headers.Authorization=`Bearer ${token}`}const res=await fetch(`${apiBase()}${path}`,{credentials:'include',...options,headers,body:options.body&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});const data=await res.json().catch(()=>({error:'Unreadable server response.'}));if(!res.ok)throw new Error(data.error||data.message||`Request failed (${res.status})`);return data}
export function redact(t=''){return String(t).replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g,'[REDACTED_GITHUB_TOKEN]').replace(/AIza[0-9A-Za-z_-]{30,}/g,'[REDACTED_GOOGLE_KEY]').replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi,'$1[REDACTED]').replace(/((?:password|secret|token|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]')}
