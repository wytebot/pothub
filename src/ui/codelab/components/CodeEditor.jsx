import {useEffect,useState} from "react";
import CodeMirror from "@uiw/react-codemirror";
import {javascript} from "@codemirror/lang-javascript";
import {json} from "@codemirror/lang-json";
import {markdown} from "@codemirror/lang-markdown";
import {python} from "@codemirror/lang-python";
import {oneDark} from "@codemirror/theme-one-dark";
import {languageFor} from "../utils";
import {loadState,saveState} from "../storage";
const lang=x=>x==="json"?json():x==="markdown"?markdown():x==="python"?python():javascript({jsx:true,typescript:true});
// Per-file edit switch. ON (default): the file can be edited inline. OFF: the code area is read-only and
// typing, pasting and drag-drop are blocked. The choice is remembered per repository + file path on this device.
const EDIT_KEY="fileEditSwitch";
const switchId=(scope,path)=>`${scope||""}::${path||""}`;
const readSwitch=(scope,path)=>{const map=loadState(EDIT_KEY,{});return map&&typeof map==="object"&&map[switchId(scope,path)]===false?false:true};
const writeSwitch=(scope,path,on)=>{const map={...(loadState(EDIT_KEY,{})||{})};if(on)delete map[switchId(scope,path)];else map[switchId(scope,path)]=false;saveState(EDIT_KEY,map)};
export default function CodeEditor({path,value,onChange,fontSize=16,wordWrap=true,onViewReady,scope=""}){
  const [text,setText]=useState(value||"");
  const [canEdit,setCanEdit]=useState(()=>readSwitch(scope,path));
  useEffect(()=>setText(value||""),[path]);
  useEffect(()=>setCanEdit(readSwitch(scope,path)),[scope,path]);
  const toggle=()=>{const next=!canEdit;setCanEdit(next);writeSwitch(scope,path,next)};
  return <div className={`editor ${canEdit?"":"editor-locked"}`}>
    <div className="editSwitchBar"><label className="editSwitch" title={canEdit?"Inline editing is on for this file":"Inline editing is off for this file"}><input type="checkbox" role="switch" checked={canEdit} onChange={toggle} aria-label={`Allow inline editing of ${path||"this file"}`}/><span className="editSwitchTrack" aria-hidden="true"><span className="editSwitchThumb"/></span><span className="editSwitchLabel">{canEdit?"Editing on":"Editing off · read-only"}</span></label></div>
    <CodeMirror value={text} height="calc(100vh - 160px)" theme={oneDark} extensions={[lang(languageFor(path))]} editable={canEdit} readOnly={!canEdit} onChange={v=>{if(!canEdit)return;setText(v);onChange(v)}} basicSetup={{lineNumbers:true,foldGutter:true,wordWrap}} onCreateEditor={view=>onViewReady?.(view)} style={{fontSize}}/>
  </div>}
