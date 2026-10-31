import React,{useMemo,useState} from 'react';
/** Fixed-height windowing keeps large local histories from mounting thousands of cards. */
export default function VirtualHistoryList({items=[],renderItem,rowHeight=148,maxHeight=620}){
 const [scrollTop,setScrollTop]=useState(0);const height=Math.min(maxHeight,Math.max(260,typeof window!=='undefined'?window.innerHeight*.68:560));
 const {start,end}=useMemo(()=>{const first=Math.max(0,Math.floor(scrollTop/rowHeight)-3);return {start:first,end:Math.min(items.length,Math.ceil((scrollTop+height)/rowHeight)+4)}},[scrollTop,rowHeight,height,items.length]);
 return <div className="virtual-history" style={{height,maxHeight}} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)}><div style={{height:items.length*rowHeight,position:'relative'}}>{items.slice(start,end).map((item,index)=><div key={item.id||start+index} style={{position:'absolute',top:(start+index)*rowHeight,left:0,right:0,height:rowHeight,overflow:'hidden'}}>{renderItem(item)}</div>)}</div></div>
}
