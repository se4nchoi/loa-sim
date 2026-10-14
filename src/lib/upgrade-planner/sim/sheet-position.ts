import { tick } from 'svelte';

/** All phone sheets use the same visible bounds, including browser chrome and the keyboard. */
export function sheetBounds(viewTop: number, viewHeight: number, barBottom: number) {
 const top = Math.max(viewTop, Math.min(barBottom, viewTop + Math.max(0, viewHeight - 64)));
 return {top, height:Math.max(0, viewTop + viewHeight - top)};
}

export function sheetPosition(node: HTMLElement, options: {card?: () => HTMLElement | undefined; phone?: string; top?: () => number} = {}) {
 const media = matchMedia(options.phone ?? '(max-width: 639px)');
 const originals = new Map<HTMLElement,string|null>();
 const remember = (el:HTMLElement) => { if(!originals.has(el)) originals.set(el,el.getAttribute('style')); };
 const restore = () => { for(const [el,style] of originals) { if(style===null)el.removeAttribute('style');else el.setAttribute('style',style); } originals.clear(); };
 const place = () => {
  if(!media.matches) {restore();return;}
  if(node instanceof HTMLDialogElement && !node.open) return;
  const viewport=window.visualViewport;
  const bar=document.querySelector<HTMLElement>('[data-cp-bar]');
  const {top,height}=sheetBounds(viewport?.offsetTop??0,viewport?.height??innerHeight,options.top?.() || bar?.getBoundingClientRect().bottom || 132);
  remember(node);
  Object.assign(node.style,{position:'fixed',top:`${top}px`,bottom:'auto',left:'0',right:'0',margin:'0',width:'100%',maxWidth:'none',height:`${height}px`,maxHeight:'none'});
  const card=options.card?.();
  if(card) {
   remember(card);Object.assign(card.style,{height:'100%',maxHeight:'100%',width:'100%',maxWidth:'none'});
   for(const child of Array.from(card.children)) if(child instanceof HTMLElement && /auto|scroll/.test(getComputedStyle(child).overflowY)) {
    remember(child);Object.assign(child.style,{minHeight:'0',maxHeight:'none',flex:'1 1 0%'});
   }
  }
 };
 const viewport=window.visualViewport;
 const observer=new MutationObserver(place);
 observer.observe(node,{attributes:true,attributeFilter:['open'],childList:true});
 const bar=document.querySelector('[data-cp-bar]');const resized=new ResizeObserver(place);if(bar)resized.observe(bar);
 viewport?.addEventListener('resize',place);viewport?.addEventListener('scroll',place);window.addEventListener('resize',place);media.addEventListener('change',place);
 void tick().then(place);
 return {destroy(){observer.disconnect();resized.disconnect();viewport?.removeEventListener('resize',place);viewport?.removeEventListener('scroll',place);window.removeEventListener('resize',place);media.removeEventListener('change',place);restore();}};
}
