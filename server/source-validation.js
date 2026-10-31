import ts from 'typescript';
export function validateSourceSyntax(fileName,content){
  const ext=String(fileName).toLowerCase().split('.').pop();
  if(!['js','jsx','mjs','cjs','ts','tsx'].includes(ext))return {valid:true,diagnostics:[]};
  const result=ts.transpileModule(String(content),{fileName:String(fileName),reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,allowJs:true,checkJs:false}});
  const diagnostics=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  return {valid:diagnostics.length===0,diagnostics:diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '))};
}
export function assertValidSourceSyntax(fileName,content){const result=validateSourceSyntax(fileName,content);if(!result.valid)throw new Error(`Proposed ${String(fileName).split('.').pop().toUpperCase()} source does not parse: ${result.diagnostics.slice(0,4).join('; ')}`);return true;}
