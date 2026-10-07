export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function shade(hex:string,amount:number){const n=parseInt(hex.slice(1),16);return '#'+((1<<24)+(clamp((n>>16)+amount,0,255)<<16)+(clamp(((n>>8)&255)+amount,0,255)<<8)+clamp((n&255)+amount,0,255)).toString(16).slice(1)}
export function hash2(r:number,c:number){let n=(r*374761393+c*668265263)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296}
