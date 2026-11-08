// WyteLab-compatible GitHub operations for PotHub Codelab.
// Ported from the WyteLab API so Codelab behaves exactly like WyteLab, but it runs on
// PotHub's own authenticated session (s.githubToken) instead of a separate WyteLab login.
// Credit-charged actions (pull request creation, revert) are metered by app.js before this runs.
const GH="https://api.github.com";
export function normalizeRepoPath(value){
  // Cleans surrounding spaces, "./", control characters and Windows separators. Absolute paths (leading "/" or a drive letter), ".." and empty paths are refused, and the
  // message says exactly what was received so the cause can be found.
  const original=String(value??"");
  const raw=original.replace(/[\u0000-\u001f\u007f]/g,"").trim().replaceAll("\\","/");
  const shown=original.replace(/[\u0000-\u001f\u007f]/g,"?").slice(0,120);
  if(raw.startsWith("/")||/^[A-Za-z]:/.test(raw))throw Object.assign(new Error(`Invalid repository path "${shown}": paths must be relative to the repository (for example, src/App.jsx).`),{status:400,code:"INVALID_REPOSITORY_PATH"});
  const parts=raw.split("/").map(part=>part.trim()).filter(part=>part&&part!==".");
  if(!parts.length)throw Object.assign(new Error(`Invalid repository path: no file was selected${shown.trim()?` (received "${shown}")`:""}. Tap a file in the list (for example, src/App.jsx).`),{status:400,code:"INVALID_REPOSITORY_PATH"});
  if(parts.some(part=>part===".."))throw Object.assign(new Error(`Invalid repository path "${shown}": ".." is not allowed. Choose a file inside the selected repository.`),{status:400,code:"INVALID_REPOSITORY_PATH"});
  return parts.join("/");
}
function ghHeaders(token){return{"Authorization":`Bearer ${token}`,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"PotHub-Codelab"};}
async function gh(token,path,opts={}){
  const controller=new AbortController();
  const timeoutMs=Math.max(5000,Number(opts.timeoutMs)||45000);
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const callerSignal=opts.signal;
  const abortCaller=()=>controller.abort();
  if(callerSignal){
    if(callerSignal.aborted)controller.abort();
    else callerSignal.addEventListener("abort",abortCaller,{once:true});
  }
  const fetchOpts={...opts}; delete fetchOpts.timeoutMs;
  try{
    const r=await fetch(GH+path,{...fetchOpts,signal:controller.signal,headers:{...ghHeaders(token),...(opts.headers||{})}});
    const text=await r.text(); let data;
    try{data=JSON.parse(text)}catch{data={message:text}}
    if(!r.ok){
      const retryAfter=Number(r.headers.get("retry-after")||0)||0;
      const reset=Number(r.headers.get("x-ratelimit-reset")||0)||0;
      const remaining=r.headers.get("x-ratelimit-remaining");
      const err=Object.assign(new Error(data.message||`GitHub request failed (${r.status})`),{status:r.status,data,headers:{retryAfter,reset,remaining}});
      if(r.status===403||r.status===429){
        if(retryAfter)err.retryAfter=retryAfter;
        else if(remaining==="0"&&reset)err.retryAfter=Math.max(1,reset-Math.floor(Date.now()/1000));
        else if(r.status===403 && /rate limit|secondary rate limit/i.test(String(data.message||"")))err.retryAfter=60;
        err.code=remaining==="0"?"GITHUB_RATE_LIMIT":"GITHUB_FORBIDDEN";
      }
      throw err;
    }
    return data;
  }catch(e){
    if(e?.name==="AbortError"&&!callerSignal?.aborted)throw Object.assign(new Error(`GitHub request timed out after ${Math.round(timeoutMs/1000)} seconds.`),{code:"GITHUB_TIMEOUT",retryable:true});
    if(e?.code==="ECONNRESET"||e?.code==="ETIMEDOUT"||/fetch failed|network/i.test(String(e?.message||"")))throw Object.assign(new Error(e.message||"Unable to reach GitHub."),{code:e.code||"GITHUB_NETWORK_ERROR",retryable:true});
    throw e;
  }finally{
    clearTimeout(timer);
    if(callerSignal)callerSignal.removeEventListener("abort",abortCaller);
  }
}
// GitHub can 404 when reading the tree of a commit whose tree is genuinely
// empty (e.g. a commit that deleted every file), even though the commit and
// branch are both real — a documented GitHub API quirk (confirmed by
// GitHub's own community forum), not a sign that anything is actually
// missing. Treat that specific case as a real, empty tree instead of
// surfacing a confusing "Not Found" for what is a legitimate repo state.
async function readTreeOrEmpty(token,path){
  try{ return await gh(token,path); }
  catch(e){ if(e.status===404) return {tree:[]}; throw e; }
}
const json=(res,status,obj)=>{res.setHeader("Cache-Control","no-store, private, max-age=0");return res.status(status).json(obj)};
const body=async(req)=>(req.body&&typeof req.body==="object"?req.body:{});
const hasOAuthScope=()=>true; // GitHub itself rejects workflow-file writes if the OAuth grant lacks the scope.

export async function wytelabGithub(req,res,p,s){
  const url=new URL(req.originalUrl||req.url,"http://pothub.local");
  try{
    const lkm=p.match(/^\/github\/licenses\/([^/]+)$/);
    if(lkm&&req.method==="GET"){
      // License templates are available without a subscription plan.
      const key=decodeURIComponent(lkm[1]);
      const lic=await gh(s.githubToken,`/licenses/${encodeURIComponent(key)}`);
      return json(res,200,{key:lic.key,name:lic.name,body:lic.body});
    }
    const bm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/branches$/);
    if(bm&&req.method==="POST"){const owner=decodeURIComponent(bm[1]),repo=decodeURIComponent(bm[2]),b=await body(req);const name=String(b.name||"").trim();const from=String(b.from||"").trim();if(!/^[A-Za-z0-9._\/-]{1,120}$/.test(name)||name.startsWith("-")||name.endsWith("/"))return json(res,400,{error:"Invalid branch name"});const ref=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(from)}`);const created=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,{method:"POST",body:JSON.stringify({ref:`refs/heads/${name}`,sha:ref.object.sha})});return json(res,201,{name,sha:created.object.sha});}
    // Pull requests are free: the user's own GitHub token performs the operation.
    const prm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/pulls$/);
    if(prm){
      const owner=decodeURIComponent(prm[1]),repo=decodeURIComponent(prm[2]);
      if(req.method==="GET")return json(res,200,await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&per_page=30`));
      if(req.method==="POST"){
        const b=await body(req);
        const title=String(b.title||"").trim(),head=String(b.head||"").trim(),base=String(b.base||"").trim();
        if(!title||!head||!base)return json(res,400,{error:"Title, head branch and base branch are required"});
        if(head===base)return json(res,400,{error:"Head and base branches must be different"});
        const payload={title,head,base};
        if(b.body)payload.body=String(b.body).slice(0,5000);
        const created=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,{method:"POST",body:JSON.stringify(payload)});
        return json(res,201,created);
      }
    }
    // GitHub Actions Control Center. These endpoints keep the user's GitHub
    // token server-side and turn common Actions chores into quick mobile-
    // friendly operations. Reading, inspection, dispatch and cancellation are
    // free; rerunning failed jobs is the paid Actions operation.
    const arm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/actions\/runs$/);
    if(arm&&req.method==="GET"){
      const owner=decodeURIComponent(arm[1]),repo=decodeURIComponent(arm[2]);
      const runs=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=25`);
      return json(res,200,{runs:Array.isArray(runs?.workflow_runs)?runs.workflow_runs:[],total:Number(runs?.total_count||0)});
    }
    const ajm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/actions\/runs\/([^/]+)\/jobs$/);
    if(ajm&&req.method==="GET"){
      const owner=decodeURIComponent(ajm[1]),repo=decodeURIComponent(ajm[2]),runId=decodeURIComponent(ajm[3]);
      const jobs=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}/jobs?per_page=100`);
      return json(res,200,{jobs:Array.isArray(jobs?.jobs)?jobs.jobs:[]});
    }
    const arrm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/actions\/runs\/([^/]+)\/rerun-failed$/);
    if(arrm&&req.method==="POST"){
      const owner=decodeURIComponent(arrm[1]),repo=decodeURIComponent(arrm[2]),runId=decodeURIComponent(arrm[3]),b=await body(req);
      // Count only a successful GitHub rerun; failed requests must not burn a free credit.
      const path=`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}/rerun-failed-jobs`;
      const result=await gh(s.githubToken,path,{method:"POST",body:JSON.stringify({enable_debug_logging:!!b.debug})});
      const usage={};
      return json(res,201,{ok:true,debug:!!b.debug,usage,result});
    }
    const acm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/actions\/runs\/([^/]+)\/(cancel|force-cancel)$/);
    if(acm&&req.method==="POST"){
      const owner=decodeURIComponent(acm[1]),repo=decodeURIComponent(acm[2]),runId=decodeURIComponent(acm[3]),action=acm[4];
      await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}/${action}`,{method:"POST"});
      return json(res,202,{ok:true,action});
    }
    const awm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/actions\/workflows$/);
    if(awm&&req.method==="GET"){
      const owner=decodeURIComponent(awm[1]),repo=decodeURIComponent(awm[2]);
      const workflows=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows?per_page=100`);
      return json(res,200,{workflows:Array.isArray(workflows?.workflows)?workflows.workflows:[]});
    }
    const adm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/actions\/workflows\/([^/]+)\/dispatch$/);
    if(adm&&req.method==="POST"){
      const owner=decodeURIComponent(adm[1]),repo=decodeURIComponent(adm[2]),workflowId=decodeURIComponent(adm[3]),b=await body(req);
      const ref=String(b.ref||"").trim();
      if(!ref)return json(res,400,{error:"Choose a branch or tag to run the workflow."});
      const inputs=b.inputs&&typeof b.inputs==="object"&&!Array.isArray(b.inputs)?b.inputs:{};
      if(Object.keys(inputs).length>25)return json(res,400,{error:"GitHub allows at most 25 workflow inputs."});
      await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`,{method:"POST",body:JSON.stringify({ref,inputs})});
      return json(res,200,{ok:true});
    }
    // Mobile-friendly GitHub Hub: common issues/releases/PR/compare/star/fork
    // actions that otherwise require bouncing between multiple GitHub screens.
    const ghHub=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/(issues|releases|compare|pulls|star|fork)$/);
    if(ghHub){
      const owner=decodeURIComponent(ghHub[1]),repo=decodeURIComponent(ghHub[2]),kind=ghHub[3],base=`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      if(kind==="issues"&&req.method==="GET"){
        const state=url.searchParams.get("state")||"open",data=await gh(s.githubToken,`${base}/issues?state=${encodeURIComponent(state)}&per_page=50`);
        return json(res,200,{issues:(Array.isArray(data)?data:[]).filter(x=>!x.pull_request)});
      }
      if(kind==="issues"&&req.method==="POST"){
        const b=await body(req),title=String(b.title||"").trim(); if(!title)return json(res,400,{error:"Issue title is required"});
        const payload={title}; if(b.body)payload.body=String(b.body).slice(0,10000); if(Array.isArray(b.labels))payload.labels=b.labels.slice(0,20).map(String);
        return json(res,201,await gh(s.githubToken,`${base}/issues`,{method:"POST",body:JSON.stringify(payload)}));
      }
      if(kind==="releases"&&req.method==="GET"){
        const data=await gh(s.githubToken,`${base}/releases?per_page=30`); return json(res,200,{releases:Array.isArray(data)?data:[]});
      }
      if(kind==="releases"&&req.method==="POST"){
        const b=await body(req),tag=String(b.tag_name||"").trim(),name=String(b.name||tag).trim(); if(!tag)return json(res,400,{error:"Release tag is required"});
        return json(res,201,await gh(s.githubToken,`${base}/releases`,{method:"POST",body:JSON.stringify({tag_name:tag,name,body:String(b.body||"").slice(0,10000),draft:!!b.draft,prerelease:!!b.prerelease,target_commitish:String(b.target_commitish||"").trim()||undefined})}));
      }
      if(kind==="compare"&&req.method==="GET"){
        const baseRef=String(url.searchParams.get("base")||"").trim(),headRef=String(url.searchParams.get("head")||"").trim();
        if(!baseRef||!headRef)return json(res,400,{error:"Base and head refs are required"});
        const data=await gh(s.githubToken,`${base}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`);
        return json(res,200,{status:data.status,ahead_by:data.ahead_by,behind_by:data.behind_by,total_commits:data.total_commits,files:(data.files||[]).slice(0,100).map(f=>({filename:f.filename,status:f.status,additions:f.additions,deletions:f.deletions,changes:f.changes})),html_url:data.html_url});
      }
      if(kind==="pulls"&&req.method==="GET"){
        const state=url.searchParams.get("state")||"open",data=await gh(s.githubToken,`${base}/pulls?state=${encodeURIComponent(state)}&per_page=50`); return json(res,200,{pulls:Array.isArray(data)?data:[]});
      }
      if(kind==="pulls"&&req.method==="POST"){
        const b=await body(req),number=Number(b.number),method=String(b.method||"merge"); if(!number)return json(res,400,{error:"Pull request number is required"});
        const d=await gh(s.githubToken,`${base}/pulls/${number}/merge`,{method:"PUT",body:JSON.stringify({merge_method:["merge","squash","rebase"].includes(method)?method:"merge",commit_title:b.commit_title?String(b.commit_title).slice(0,200):undefined,commit_message:b.commit_message?String(b.commit_message).slice(0,5000):undefined})});
        return json(res,200,d);
      }
      if(kind==="star"&&req.method==="GET"){
        try{await gh(s.githubToken,`${base}/subscription`,{timeoutMs:10000});}catch{}
        const d=await fetch(`https://api.github.com/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,{headers:ghHeaders(s.githubToken)}); return json(res,200,{starred:d.status===204});
      }
      if(kind==="star"&&(req.method==="PUT"||req.method==="DELETE")){
        const r=await fetch(`https://api.github.com/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,{method:req.method,headers:ghHeaders(s.githubToken)});
        if(!r.ok)throw Object.assign(new Error(`GitHub star action failed (${r.status})`),{status:r.status});
        return json(res,200,{starred:req.method==="PUT"});
      }
      if(kind==="fork"&&req.method==="POST"){
        const d=await gh(s.githubToken,`${base}/forks`,{method:"POST",body:JSON.stringify({name:String((await body(req)).name||"").trim()||undefined})});
        return json(res,202,{fork:d});
      }
    }
    const safePath=normalizeRepoPath;
    const isWorkflowPath=(path)=>String(path||"").replaceAll("\\","/").toLowerCase().startsWith(".github/workflows/");
    const binaryExt=new Set(["png","jpg","jpeg","gif","webp","ico","bmp","svgz","pdf","zip","gz","tar","7z","rar","woff","woff2","ttf","otf","eot","mp3","mp4","mov","avi","webm","wav","exe","dll","so","dylib","class","jar","psd","ai","sqlite","db"]);
    const isBinaryPath=(p)=>binaryExt.has(String(p).split(".").pop()?.toLowerCase()||"");
    const mimeForPath=(p)=>({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",ico:"image/x-icon",bmp:"image/bmp",svg:"image/svg+xml",pdf:"application/pdf",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf",eot:"application/vnd.ms-fontobject",mp3:"audio/mpeg",mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",wav:"audio/wav"}[String(p).split(".").pop()?.toLowerCase()||""]||"application/octet-stream");
    const m=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/(tree|file|branches)$/);
    if(m){
      const owner=decodeURIComponent(m[1]),repo=decodeURIComponent(m[2]),kind=m[3];
      if(kind==="branches")return json(res,200,await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`));
      if(kind==="file"){const path=safePath(url.searchParams.get("path")||"") ,rawBranch=String(url.searchParams.get("branch")||"").trim(),branch=/^(undefined|null|HEAD)?$/i.test(rawBranch)?"":rawBranch;const contentsPath=`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;let d;try{d=await gh(s.githubToken,`${contentsPath}${branch?`?ref=${encodeURIComponent(branch)}`:""}`)}catch(fileErr){/* A stale or unknown branch name: read the repository default branch instead of failing. */if(branch&&(fileErr.status===404||fileErr.status===422)&&/no commit found|not found|ref/i.test(String(fileErr.message||""))){const remote=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);d=await gh(s.githubToken,`${contentsPath}?ref=${encodeURIComponent(remote.default_branch||"main")}`)}else throw fileErr}if(Array.isArray(d))return json(res,400,{error:`"${path}" is a folder, not a file. Open a file inside it.`,code:"PATH_IS_DIRECTORY"});if(isBinaryPath(path)){
        const size=Number(d.size||0), raw=String(d.content||"").replace(/\n/g,"");
        if(size>3*1024*1024) return json(res,200,{path,content:{__wydevBinary:true,base64:"",mime:mimeForPath(path),size,tooLarge:true,html_url:d.html_url||null},sha:d.sha,size,html_url:d.html_url||null});
        return json(res,200,{path,content:{__wydevBinary:true,base64:raw,mime:mimeForPath(path),size},sha:d.sha,size});
      }return json(res,200,{path,content:d.encoding==="base64"?Buffer.from(d.content.replace(/\n/g,""),"base64").toString("utf8"):d.content||"",sha:d.sha,size:d.size});}
      const branch=url.searchParams.get("branch")||"HEAD";
      try {
        const ref=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`);
        const commit=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${ref.object.sha}`);
        const tree=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${commit.tree.sha}?recursive=1`);
        return json(res,200,{branch,baseSha:ref.object.sha,treeSha:commit.tree.sha,files:(tree.tree||[]).filter(x=>x.type==="blob").map(x=>({path:x.path,sha:x.sha,size:x.size}))});
      } catch(e) {
        // A repository with zero commits (created without "Initialize with a
        // README") has no ref to read at all. Treat that as a valid, empty
        // workspace instead of surfacing a raw 404 — there's simply nothing
        // to list yet, and the first commit will create the branch.
        if(e.status===404){
          const remote=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
          return json(res,200,{branch:remote.default_branch||branch,baseSha:"",treeSha:"",files:[]});
        }
        throw e;
      }
    }
    const bm2=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/blob$/);
    if(bm2&&req.method==="POST"){
      const owner=decodeURIComponent(bm2[1]),repo=decodeURIComponent(bm2[2]),b=await body(req);
      const path=safePath(b.path);
      const encoding=b.encoding==="base64"?"base64":"utf-8";
      const content=String(b.content??"");
      if(!content && encoding==="base64") return json(res,400,{error:`Binary file ${path} has no data.`});
      // Keep individual requests safely below common serverless request limits.
      if(Buffer.byteLength(content,"utf8")>5_500_000) return json(res,413,{error:`File ${path} is too large for this upload path. Split it into smaller files.`});
      const blob=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`,{method:"POST",body:JSON.stringify({content,encoding})});
      return json(res,201,{sha:blob.sha,path});
    }
    // Last N commits on a branch, used to power the "Revert" picker. GitHub
    // 404s /commits entirely on a repository with zero commits yet — treat
    // that the same way the tree endpoint does above: an empty, valid list.
    const clm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/commits$/);
    if(clm&&req.method==="GET"){
      const owner=decodeURIComponent(clm[1]),repo=decodeURIComponent(clm[2]);
      const branch=url.searchParams.get("branch")||"";
      const perPage=Math.min(Math.max(Number(url.searchParams.get("limit"))||10,1),30);
      const qs=new URLSearchParams({per_page:String(perPage)});
      if(branch) qs.set("sha",branch);
      try{
        const commits=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${qs.toString()}`);
        return json(res,200,{commits:(commits||[]).map(c=>({
          sha:c.sha,
          message:c.commit?.message||"",
          author:c.commit?.author?.name||c.author?.login||"Unknown",
          date:c.commit?.author?.date||null,
          html_url:c.html_url
        }))});
      }catch(e){
        if(e.status===404||e.status===409) return json(res,200,{commits:[]});
        throw e;
      }
    }
    // Restores a branch to exactly the tree it had at an earlier commit,
    // without rewriting history: it builds a brand-new commit whose tree
    // matches the target commit and whose parent is the branch's current
    // tip, then fast-forwards the branch onto it (same non-force PATCH used
    // by the normal commit flow, so a concurrent push is never clobbered).
    const rvm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/revert$/);
    if(rvm&&req.method==="POST"){
      const owner=decodeURIComponent(rvm[1]),repo=decodeURIComponent(rvm[2]),b=await body(req);
      const branch=String(b.branch||"").trim(), targetSha=String(b.sha||"").trim();
      if(!branch||!targetSha) return json(res,400,{error:"A branch and a commit to revert to are required"});
      const encodedOwner=encodeURIComponent(owner),encodedRepo=encodeURIComponent(repo);
      const refPath=(name)=>`/repos/${encodedOwner}/${encodedRepo}/git/ref/heads/${encodeURIComponent(name)}`;
      const updateRefPath=(name)=>`/repos/${encodedOwner}/${encodedRepo}/git/refs/heads/${encodeURIComponent(name)}`;
      let ref;
      try{ ref=await gh(s.githubToken,refPath(branch)); }
      catch(e){ if(e.status===404) return json(res,404,{error:`Branch "${branch}" could not be found.`,code:"BRANCH_NOT_FOUND"}); throw e; }
      const currentSha=String(ref.object.sha||"");
      if(currentSha===targetSha) return json(res,400,{error:"The repository is already at that commit."});
      let targetCommit;
      try{ targetCommit=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/commits/${encodeURIComponent(targetSha)}`); }
      catch(e){ if(e.status===404) return json(res,404,{error:"That commit could not be found on GitHub."}); throw e; }
      // Reverting can reintroduce or remove workflow files, which needs the
      // same elevated OAuth scope the normal commit path requires.
      const currentCommit=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/commits/${currentSha}`);
      const [targetTree,currentTree]=await Promise.all([
        readTreeOrEmpty(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/trees/${targetCommit.tree.sha}?recursive=1`),
        readTreeOrEmpty(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/trees/${currentCommit.tree.sha}?recursive=1`)
      ]);
      const touchesWorkflow=[...(targetTree.tree||[]),...(currentTree.tree||[])].some(x=>x.type==="blob"&&isWorkflowPath(x.path));
      if(touchesWorkflow&&!hasOAuthScope(s,"workflow")) return json(res,403,{error:"GitHub requires the workflow permission to revert changes touching .github/workflows/. Sign out and sign in again so PotHub Codelab can request the GitHub Actions workflow permission.",code:"GITHUB_WORKFLOW_SCOPE_REQUIRED"});
      const shortMsg=String(targetCommit.message||"").split("\n")[0].slice(0,72);
      const message=`Revert to ${targetSha.slice(0,7)}: ${shortMsg}`.slice(0,200);
      const commit=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/commits`,{method:"POST",body:JSON.stringify({message,tree:targetCommit.tree.sha,parents:[currentSha]})});
      try{
        await gh(s.githubToken,updateRefPath(branch),{method:"PATCH",body:JSON.stringify({sha:commit.sha,force:false})});
      }catch(e){
        if(e.status===404) return json(res,409,{error:`Branch "${branch}" could not be found while reverting. Your history was not changed.`,code:"BRANCH_NOT_FOUND"});
        if(e.status===422||e.status===409) return json(res,409,{error:"GitHub changed the branch while reverting. Reload and try again.",code:"PUSH_RACE"});
        throw e;
      }
      return json(res,200,{ok:true,commitSha:commit.sha,revertedTo:targetSha,branch});
    }
    if(p==="/github/repos/commit"&&req.method==="POST"){const b=await body(req);return json(res,400,{error:"Use /github/repos/:owner/:repo/commit"});}
    const cm=p.match(/^\/github\/repos\/([^/]+)\/([^/]+)\/commit$/);
    if(cm&&req.method==="POST"){
      const owner=decodeURIComponent(cm[1]),repo=decodeURIComponent(cm[2]),b=await body(req); let branch=String(b.branch||"").trim(); const message=String(b.message||"").trim(),changes=Array.isArray(b.changes)?b.changes:[];
      if(!branch||!message||message.length>200)return json(res,400,{error:"A commit message (1-200 characters) is required"});
      if(changes.length>300)return json(res,413,{error:"Too many changed files in one push. Split the work into smaller commits."});
      // safePath both validates AND normalizes (strips leading slashes,
      // converts backslashes to forward slashes). The normalized value must
      // be written back onto each change, otherwise validation runs against
      // the cleaned path while the tree entries below still use the raw,
      // un-normalized one — so a path with a leading "/" or a Windows-style
      // "\" backslash would pass the check but still get sent to GitHub's
      // Trees API verbatim, creating a literally-named file instead of the
      // intended nested path.
      for(const c of changes) c.path=safePath(c.path);
      if(changes.some(c=>isWorkflowPath(c.path))&&!hasOAuthScope(s,"workflow")) return json(res,403,{error:"GitHub requires the workflow permission to add or update files under .github/workflows/. Sign out and sign in again so PotHub Codelab can request the GitHub Actions workflow permission.",code:"GITHUB_WORKFLOW_SCOPE_REQUIRED"});
      let ref;
      let emptyRepo=false;
      const encodedOwner=encodeURIComponent(owner),encodedRepo=encodeURIComponent(repo);
      const refPath=(name)=>`/repos/${encodedOwner}/${encodedRepo}/git/ref/heads/${encodeURIComponent(name)}`;
      // GitHub's Git Database API splits this across two different paths:
      // reading a ref uses the singular "ref" (refPath above), but updating
      // one requires the plural "refs" — PATCHing the singular path 404s
      // even when the branch genuinely exists. Using refPath for the PATCH
      // below was the actual cause of "Branch could not be found while
      // pushing": every push would create the commit successfully, then
      // fail forever trying to move the branch pointer onto it.
      const updateRefPath=(name)=>`/repos/${encodedOwner}/${encodedRepo}/git/refs/heads/${encodeURIComponent(name)}`;
      // GitHub can briefly return 404 for refs immediately after repository
      // creation/branch operations (or just from read-replica lag on a busy
      // push), so a single failed GET/PATCH must never be reported as
      // "branch not found" on its own. Defined up front so every ref check
      // below — not just the final PATCH — benefits from the same retries.
      const readBranchRefWithRetry = async (name, attempts=7) => {
        let lastError;
        for(let attempt=0; attempt<attempts; attempt++){
          try { return await gh(s.githubToken,refPath(name)); }
          catch(e){
            lastError=e;
            if(e.status!==404 || attempt===attempts-1) throw e;
            await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
          }
        }
        throw lastError;
      };
      const patchBranchWithRetry = async (name, expectedTip, newSha) => {
        let lastError;
        for(let attempt=0; attempt<5; attempt++){
          try {
            const live=await readBranchRefWithRetry(name,4);
            if(String(live.object?.sha||"")!==String(expectedTip||"")){
              return {race:true,remoteSha:live.object?.sha||""};
            }
            await gh(s.githubToken,updateRefPath(name),{
              method:"PATCH",
              body:JSON.stringify({sha:newSha,force:false})
            });
            return {ok:true};
          } catch(e){
            lastError=e;
            if(e.status!==404 || attempt===4) throw e;
            await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
          }
        }
        throw lastError;
      };
      try {
        ref=await gh(s.githubToken,refPath(branch));
      } catch(e) {
        if(e.status===404){
          // A cached branch can disappear after a rename/deletion. Do not try
          // to manufacture a stale branch on every commit: use the repository
          // default branch, which is the branch GitHub itself treats as the
          // canonical target for normal repository writes.
          const remote=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}`);
          const liveBranch=String(remote.default_branch||"").trim();
          if(liveBranch){
            try {
              ref=await gh(s.githubToken,refPath(liveBranch));
              branch=liveBranch;
            } catch(liveErr) {
              if(liveErr.status!==404) throw liveErr;
              // No default-branch ref means the repository has no commits yet.
              emptyRepo=true;
              branch=liveBranch;
            }
          } else {
            emptyRepo=true;
          }
        } else throw e;
      }
      const expectedSha=String(b.expectedSha||"").trim();
      const baseFiles=Array.isArray(b.baseFiles)?b.baseFiles:[];
      let initialSha=emptyRepo?"":String(ref.object.sha||"");
      let head=emptyRepo?null:await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/commits/${initialSha}`);

      // If the branch moved since WyteLab loaded the project, safely replay the
      // user's local changes on top of the newer remote tree. A conflict is
      // reported only when the same path was also changed remotely. Unrelated
      // remote commits therefore no longer cause a false "REMOTE CHANGES
      // DETECTED" block, while we still never overwrite another user's edit.
      if(!emptyRepo&&expectedSha&&initialSha!==expectedSha){
        const baseByPath=new Map(baseFiles.map(x=>[String(x?.path||""),String(x?.sha||"")]));
        const latestCommit=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/commits/${initialSha}`);
        const latestTree=await readTreeOrEmpty(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/trees/${latestCommit.tree.sha}?recursive=1`);
        const remoteByPath=new Map((latestTree.tree||[]).filter(x=>x.type==="blob").map(x=>[String(x.path),String(x.sha||"")]));
        const conflicts=[];
        for(const c of changes){
          const path=String(c.path||"");
          const before=baseByPath.get(path)||"";
          const remote=remoteByPath.get(path)||"";
          if(c.status==="A"){
            if(remote) conflicts.push(path);
          }else if(c.status==="D"){
            if(remote&&before&&remote!==before) conflicts.push(path);
          }else if(c.status==="M") {
            if(remote!==before) conflicts.push(path);
          }
        }
        if(conflicts.length){
          return json(res,409,{error:"GitHub changed the same files you changed. Review the conflicts before pushing.",code:"REMOTE_CONFLICT",remoteSha:initialSha,localSha:expectedSha,conflicts:conflicts.slice(0,50)});
        }
        head=latestCommit;
      }
      const entries=[];
      const uploads=[];
      for(const c of changes){
        if(!c.path) continue;
        // Nothing exists yet in an empty repository, so a "delete" entry has
        // nothing to remove — including it would just confuse the Trees API,
        // which has no base_tree to delete from.
        if(c.status==="D"){if(!emptyRepo)entries.push({path:c.path,mode:"100644",type:"blob",sha:null});continue}
        if(c.blobSha){entries.push({path:c.path,mode:"100644",type:"blob",sha:String(c.blobSha)});continue}
        const binary=c.content&&typeof c.content==="object"&&c.content.__wydevBinary===true;
        if(binary&&!c.content.base64)return json(res,400,{error:`Binary file ${c.path} has no data.`});
        uploads.push({c,binary});
      }
      // Backwards-compatible fallback for older clients that still send file
      // contents directly to the commit endpoint.
      const blobResults=await Promise.all(uploads.map(async ({c,binary})=>{
        const raw=binary?String(c.content.base64):String(c.content??"");
        if(Buffer.byteLength(raw,"utf8")>5_500_000) throw Object.assign(new Error(`File ${c.path} is too large for the commit request. Re-upload with the latest PotHub Codelab version.`),{status:413});
        const blob=await gh(s.githubToken,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`,{method:"POST",body:JSON.stringify({content:raw,encoding:binary?"base64":"utf-8"})});
        return {path:c.path,mode:"100644",type:"blob",sha:blob.sha};
      }));
      entries.push(...blobResults);
      // Build a delta tree on top of the exact branch tip we validated. GitHub's
      // Trees API explicitly supports base_tree plus changed entries, and sha:null
      // deletes an existing path. This is both safer and much smaller than rebuilding
      // an entire repository tree in the request (large repositories can otherwise
      // hit GitHub/Vercel request-size limits or silently omit remote files).
      // Preserve the existing file mode when modifying a tracked file (for example
      // executable scripts), while new files use the normal 100644 mode.
      let existingModes=new Map();
      if(!emptyRepo){
        const sourceTree=await readTreeOrEmpty(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/trees/${head.tree.sha}?recursive=1`);
        existingModes=new Map((sourceTree.tree||[])
          .filter(x=>x&&x.path&&x.sha&&(x.type==="blob"||x.type==="commit"))
          .map(x=>[String(x.path),{mode:String(x.mode||(x.type==="commit"?"160000":"100644")),type:x.type}]));
      }
      const treeEntries=[];
      for(const c of changes){
        const path=String(c.path||"");
        if(!path) continue;
        if(c.status==="D") {
          treeEntries.push({path,mode:"100644",type:"blob",sha:null});
          continue;
        }
        const old=existingModes.get(path);
        const mode=old?.type==="blob"&&["100644","100755","120000"].includes(old.mode) ? old.mode : "100644";
        treeEntries.push({path,mode,type:"blob",sha:String(c.blobSha||"")});
      }
      for(const r of blobResults){
        if(!treeEntries.some(x=>x.path===r.path)) treeEntries.push(r);
      }
      // An empty repository has no base tree, so the root tree is composed only
      // from the new files. For an existing repository, use the validated current
      // commit tree as the base and apply only the user's delta.
      let placeholder="";
      let treeBody;
      if(emptyRepo){
        const liveEntries=treeEntries.filter(x=>x.sha);
        if(!liveEntries.length){
          const keep=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/blobs`,{method:"POST",body:JSON.stringify({content:"",encoding:"utf-8"})});
          liveEntries.push({path:".gitkeep",mode:"100644",type:"blob",sha:keep.sha});
          placeholder=".gitkeep";
        }
        treeBody={tree:liveEntries};
      }else{
        treeBody={base_tree:head.tree.sha,tree:treeEntries};
      }
      const treeSha=(await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/trees`,{
        method:"POST",
        body:JSON.stringify(treeBody)
      })).sha;
      // Re-check the branch after blob creation and immediately before making
      // the tree/commit. ZIP uploads can take long enough for another GitHub
      // change to land while we are uploading blobs. Never build a commit on
      // top of a stale parent. This now shares the same retrying reader as the
      // final PATCH below, so a single transient 404 here can no longer abort
      // an otherwise-healthy push.
      if(!emptyRepo){
        try {
          const latest=await readBranchRefWithRetry(branch,5);
          if(String(latest.object?.sha||"")!==initialSha){
            return json(res,409,{error:"GitHub changed this branch while PotHub Codelab was preparing your push. Your local changes were kept. Review or reload the latest repository state before pushing again.",code:"PUSH_RACE",remoteSha:latest.object?.sha||"",localSha:initialSha});
          }
        } catch(e){
          if(e.status===404)return json(res,409,{error:`Branch "${branch}" no longer exists on GitHub. Your local changes were kept. Refresh the repository and select an existing branch.`,code:"BRANCH_NOT_FOUND",branch});
          throw e;
        }
      }
      const commitBody=emptyRepo?{message,tree:treeSha}:{message,tree:treeSha,parents:[initialSha]};
      const commit=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/commits`,{method:"POST",body:JSON.stringify(commitBody)});
      // Publish the commit atomically against the branch tip we validated.
      try {
        if(emptyRepo){
          // A commit object can be created before the first branch exists.
          // Create the ref only after the commit has been created. If another
          // client wins the first-push race, never overwrite its branch.
          try {
            await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}/git/refs`,{
              method:"POST",
              body:JSON.stringify({ref:`refs/heads/${branch}`,sha:commit.sha})
            });
          } catch(e){
            if(e.status===422){
              const live=await readBranchRefWithRetry(branch,5);
              return json(res,409,{
                error:"Another commit was pushed to this repository while PotHub Codelab was creating the first branch. Your local changes were kept and no force-push was performed.",
                code:"PUSH_RACE",
                remoteSha:live.object?.sha||"",
                localSha:""
              });
            }
            throw e;
          }
        } else {
          const result=await patchBranchWithRetry(branch,initialSha,commit.sha);
          if(result?.race){
            return json(res,409,{
              error:"GitHub changed this branch while PotHub Codelab was committing. Your local changes were kept and no force-push was performed.",
              code:"PUSH_RACE",
              remoteSha:result.remoteSha,
              localSha:initialSha
            });
          }
        }
      } catch(e) {
        if(e.status===404){
          // Re-resolve the repository metadata before declaring the branch
          // genuinely missing. This also handles a renamed default branch.
          try {
            const remote=await gh(s.githubToken,`/repos/${encodedOwner}/${encodedRepo}`);
            const liveBranch=String(remote.default_branch||"").trim();
            if(liveBranch && liveBranch!==branch){
              try {
                const live=await readBranchRefWithRetry(liveBranch,5);
                return json(res,409,{
                  error:`Branch "${branch}" no longer exists on GitHub. The repository now uses "${liveBranch}" as its default branch. Reload the repository to continue on the current branch.`,
                  code:"BRANCH_NOT_FOUND",
                  branch,
                  currentBranch:liveBranch,
                  remoteSha:live.object?.sha||""
                });
              } catch(liveErr) {
                if(liveErr.status!==404) throw liveErr;
              }
            }
            // The repository itself still reports this exact branch as its
            // default. GitHub would never report a nonexistent branch as the
            // default branch, so the preceding run of 404s was read-replica
            // lag, not a real deletion. Give the push one final, generously
            // retried attempt instead of discarding a healthy commit.
            if(liveBranch && liveBranch===branch){
              try {
                const retryResult=await patchBranchWithRetry(branch,initialSha,commit.sha);
                if(retryResult?.race){
                  return json(res,409,{
                    error:"GitHub changed this branch while PotHub Codelab was committing. Your local changes were kept and no force-push was performed.",
                    code:"PUSH_RACE",
                    remoteSha:retryResult.remoteSha,
                    localSha:initialSha
                  });
                }
                return json(res,200,{ok:true,commitSha:commit.sha,html_url:commit.html_url,branch,placeholder});
              } catch(retryErr) {
                if(retryErr.status!==404) throw retryErr;
              }
            }
          } catch(resolveErr) {
            console.warn("Branch re-resolution failed:",resolveErr.message);
          }
          return json(res,409,{
            error:`Branch "${branch}" could not be found while pushing. GitHub did not accept the ref update, so your local changes were kept. Reload the repository and try again.`,
            code:"BRANCH_NOT_FOUND",
            branch,
            details:e.data||null
          });
        }
        if(e.status===422 || e.status===409){
          return json(res,409,{
            error:"GitHub changed or rejected the branch during the push. Your local changes were kept and PotHub Codelab did not force-push.",
            code:"PUSH_RACE",
            details:e.data||null
          });
        }
        throw e;
      }
      return json(res,200,{ok:true,commitSha:commit.sha,html_url:commit.html_url,branch,placeholder});
    }
    return json(res,404,{error:"Route not found"});
  }catch(e){const status=Number(e.status)||500;const hint=status===401?" GitHub authorization expired. Reconnect GitHub.":status===403&&e.code!=="GITHUB_RATE_LIMIT"?" Check that PotHub has repo access (and SAML SSO authorization for organization repositories).":"";return json(res,status,{error:`${e.message||"Server error"}${hint}`.slice(0,500),code:e.code||`HTTP_${status}`,requestId:req.requestId,...(status===401?{reconnect:true}:{})});}
}
