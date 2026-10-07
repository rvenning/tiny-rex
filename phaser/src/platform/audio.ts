/** Small Web Audio adapter: synthesis is appropriate for Tiny Rex's original voice. */
export class Audio {
 enabled=true;private context?:AudioContext;
 unlock(){if(!this.context)this.context=new AudioContext();void this.context.resume()}
 tone(freq:number,duration=.12,delay=0,type:OscillatorType='triangle',volume=.08){
  if(!this.enabled||!this.context)return;const c=this.context,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(50,freq*.8),t+duration);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect()};
 }
 play(kind:string,tier=1){
  if(kind==='grow'||kind==='win'){[392,494,588,784].forEach((f,i)=>this.tone(f*Math.pow(1.03,tier),.22,i*.075));return}
  if(kind==='eat'){const f=640*Math.pow(.86,tier-1);this.tone(f,.055,0,'square',.045);this.tone(f*.6,.09,.04);return}
  if(kind==='hurt'){this.tone(240,.2,0,'sine');this.tone(160,.17,.09,'sine');return}
  if(kind==='nope'){this.tone(210,.06);this.tone(175,.08,.07);return}
  if(kind==='shrink'){[523,440,349].forEach((f,i)=>this.tone(f,.16,i*.08));return}
  if(kind==='wave'){[294,262,233].forEach((f,i)=>this.tone(f,.18,i*.1));return}
  this.tone(kind==='bump'?520:880,.06,0,'sine',.035);
 }
}
