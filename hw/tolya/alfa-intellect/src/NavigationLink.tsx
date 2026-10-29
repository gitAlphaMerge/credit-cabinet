import type { AnchorHTMLAttributes, MouseEvent } from "react";

export function isPlainNavigation(event: Pick<MouseEvent,"button"|"metaKey"|"ctrlKey"|"shiftKey"|"altKey"|"defaultPrevented">) {
  return !event.defaultPrevented && event.button===0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
/** Real URL first; SPA enhancement never prevents modifier clicks or native fallback. */
export function NavigationLink({to,go,children,onClick,...props}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>,"href"> & {to:string;go(path:string):void}) {
  return <a {...props} href={to} onClick={event=>{
    onClick?.(event);
    if(!isPlainNavigation(event)||props.target==="_blank"||props.download!==undefined)return;
    try {go(to);event.preventDefault();}catch{/* Keep the real href usable if enhanced navigation fails. */}
  }}>{children}</a>;
}
