import {useCallback,useEffect,useRef} from 'react';

/** Keep chat pinned to the latest answer until the reader interacts with the transcript.
 * Touch, pointer, or upward wheel movement pauses following; scrolling back to the bottom resumes it.
 */
export default function useChatAutoFollow(items){
 const containerRef=useRef(null);
 const followRef=useRef(true);
 const resume=useCallback(()=>{followRef.current=true;const el=containerRef.current;if(el)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});},[]);
 const pause=useCallback(()=>{followRef.current=false;const el=containerRef.current;if(el)el.scrollTo({top:el.scrollTop,behavior:'auto'});},[]);
 const onScroll=useCallback(()=>{const el=containerRef.current;if(!el)return;if(el.scrollHeight-el.scrollTop-el.clientHeight<56)followRef.current=true;},[]);
 const onWheel=useCallback(e=>{if(e.deltaY<0){followRef.current=false;const el=containerRef.current;if(el)el.scrollTo({top:el.scrollTop,behavior:'auto'});}else if(containerRef.current){const el=containerRef.current;if(el.scrollHeight-el.scrollTop-el.clientHeight<56)followRef.current=true;}},[]);
 useEffect(()=>{const el=containerRef.current;if(!el||!followRef.current)return;const frame=requestAnimationFrame(()=>{if(followRef.current)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});});return()=>cancelAnimationFrame(frame);},[items]);
 return {containerRef,resume,pause,onScroll,onWheel,onTouchStart:pause,onPointerDown:pause};
}
