/* Critical springs preserve presentation values and velocity on retargeting. */
(function(root){
 'use strict';
 function springStep(state,target,dt,response=.4){
  const omega=2*Math.PI/response, offset=state.value-target;
  const coefficient=state.velocity+omega*offset, decay=Math.exp(-omega*dt);
  return {value:target+(offset+coefficient*dt)*decay,velocity:(state.velocity-omega*coefficient*dt)*decay};
 }
 function secureSample(length=20){
  const groups=['ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz','0123456789','!@#$%&*?'];
  const pool=groups.join('');
  function random(max){const bytes=new Uint32Array(1),limit=Math.floor(4294967296/max)*max;do{root.crypto.getRandomValues(bytes);}while(bytes[0]>=limit);return bytes[0]%max;}
  const chars=groups.map(group=>group[random(group.length)]);
  while(chars.length<length)chars.push(pool[random(pool.length)]);
  for(let i=chars.length-1;i>0;i--){const j=random(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
  return chars.join('');
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={springStep,secureSample};return;}
 document.addEventListener('DOMContentLoaded',()=>{
  const demo=document.getElementById('demo-password');
  if(demo&&root.crypto){const regenerate=()=>{demo.textContent=secureSample();};regenerate();document.getElementById('demo-regenerate').addEventListener('click',regenerate);}
  const reduced=root.matchMedia('(prefers-reduced-motion: reduce)');
  const hero=document.querySelector('.product-hero'),key=document.querySelector('.hero-key');
  const channels=[];let frame=0,last=0;
  function channel(initial,draw){const item={state:{value:initial,velocity:0},target:initial,draw};channels.push(item);return item;}
  function tick(time){const dt=Math.min((time-last)/1000,.064);last=time;let active=false;
   for(const item of channels){item.state=springStep(item.state,item.target,dt);const settled=Math.abs(item.state.value-item.target)<.005&&Math.abs(item.state.velocity)<.01;if(settled)item.state={value:item.target,velocity:0};else active=true;item.draw(item.state.value);}
   frame=active?root.requestAnimationFrame(tick):0;
  }
  function retarget(item,target){item.target=target;if(reduced.matches){item.state={value:target,velocity:0};item.draw(target);return;}if(!frame){last=performance.now();frame=root.requestAnimationFrame(tick);}}
  let tiltX,tiltY;
  if(hero&&key){tiltX=channel(0,value=>key.style.setProperty('--key-x',value+'deg'));tiltY=channel(0,value=>key.style.setProperty('--key-y',value+'deg'));
   hero.addEventListener('pointermove',event=>{if(reduced.matches||event.pointerType!=='mouse')return;const rect=hero.getBoundingClientRect();retarget(tiltX,((event.clientY-rect.top)/rect.height-.5)*-5);retarget(tiltY,((event.clientX-rect.left)/rect.width-.5)*7);});
   hero.addEventListener('pointerleave',()=>{retarget(tiltX,0);retarget(tiltY,0);});
  }
  const reveals=[];
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){const item=reveals.find(item=>item.el===entry.target);if(item)retarget(item.motion,0);observer.unobserve(entry.target);}}},{threshold:.08});
  for(const el of document.querySelectorAll('[data-reveal]')){
   if(reduced.matches||el.getBoundingClientRect().top<root.innerHeight)continue;
   const motion=channel(24,value=>{el.style.setProperty('--reveal-y',value+'px');el.style.setProperty('--reveal-opacity',String(1-value/24));});motion.draw(24);reveals.push({el,motion});observer.observe(el);
  }
  reduced.addEventListener('change',()=>{if(reduced.matches){if(frame)root.cancelAnimationFrame(frame);frame=0;for(const item of channels){item.target=0;item.state={value:0,velocity:0};item.draw(0);}observer.disconnect();}});
 });
})(globalThis);
