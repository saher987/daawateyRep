// Shared by video.html and short.html: the 2D Mom/Dad busts, the seeded random
// generator (keeps every render identical) and the background sparkles.
// ---------- characters (simple flat busts; mood = worried | happy) ----------
function bust(who, mood){
  const skin = who==='mom' ? '#f1c39b' : '#e2b088';
  const hair = who==='mom' ? '#3b2418' : '#2a1d16';
  let s = '<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg">';
  if (who==='mom') s += `<path d="M48 120 Q44 38 120 30 Q196 38 192 120 L198 232 Q120 252 42 232Z" fill="${hair}"/>`;
  // body
  s += who==='mom'
    ? `<path d="M18 300 Q28 214 120 204 Q212 214 222 300Z" fill="#8c2f4a"/><path d="M84 214 Q120 246 156 214" stroke="#e3c48a" stroke-width="5" fill="none"/>`
    : `<path d="M18 300 Q28 214 120 204 Q212 214 222 300Z" fill="#1f2b45"/><path d="M98 208 L120 262 L142 208Z" fill="#f5efe3"/><path d="M114 214 L126 214 L130 262 L120 274 L110 262Z" fill="#c9a35a"/>`;
  s += `<rect x="102" y="168" width="36" height="44" rx="10" fill="${skin}" opacity=".92"/>`;
  if (who==='dad') s += `<circle cx="63" cy="130" r="13" fill="${skin}"/><circle cx="177" cy="130" r="13" fill="${skin}"/>`;
  s += `<ellipse cx="120" cy="125" rx="57" ry="67" fill="${skin}"/>`;
  s += who==='mom'
    ? `<path d="M62 116 Q68 52 120 50 Q176 52 180 114 Q152 78 120 76 Q84 78 62 116Z" fill="${hair}"/><circle cx="63" cy="150" r="6" fill="#e3c48a"/><circle cx="177" cy="150" r="6" fill="#e3c48a"/>`
    : `<path d="M63 112 Q58 50 120 48 Q184 50 177 112 Q170 76 120 74 Q72 76 63 112Z" fill="${hair}"/><path d="M63 112 Q62 96 68 88" stroke="#9a9a9a" stroke-width="6" fill="none"/><path d="M177 112 Q178 96 172 88" stroke="#9a9a9a" stroke-width="6" fill="none"/>`;
  const st = `stroke="#2b1d14" stroke-width="5" stroke-linecap="round" fill="none"`;
  if (mood==='worried'){
    s += `<path d="M80 100 L102 90" ${st}/><path d="M138 90 L160 100" ${st}/>`;
    s += `<circle cx="92" cy="116" r="6.5" fill="#2b1d14"/><circle cx="148" cy="116" r="6.5" fill="#2b1d14"/>`;
    s += `<path d="M100 ${who==='dad'?168:160} Q110 ${who==='dad'?160:152} 120 ${who==='dad'?166:158} Q130 ${who==='dad'?172:164} 140 ${who==='dad'?164:156}" ${st}/>`;
    s += `<path d="M178 64 Q188 82 178 90 Q168 82 178 64Z" fill="#8ecdf0"/>`;
  } else {
    s += `<path d="M80 96 Q91 89 102 95" ${st}/><path d="M138 95 Q149 89 160 96" ${st}/>`;
    s += `<path d="M84 118 Q92 108 100 118" ${st}/><path d="M140 118 Q148 108 156 118" ${st}/>`;
    s += `<circle cx="82" cy="142" r="12" fill="#f08a8a" opacity=".4"/><circle cx="158" cy="142" r="12" fill="#f08a8a" opacity=".4"/>`;
    const y = who==='dad' ? 158 : 150;
    s += `<path d="M96 ${y} Q120 ${y+30} 144 ${y}Z" fill="#6b1f1f"/><path d="M100 ${y+1} Q120 ${y+9} 140 ${y+1}Z" fill="#fff"/>`;
  }
  if (who==='dad') s += `<path d="M94 150 Q107 140 120 147 Q133 140 146 150 Q133 157 120 152 Q107 157 94 150Z" fill="${hair}"/>`;
  if (who==='mom') s += `<path d="M104 ${mood==='happy'?150:158} Q120 ${mood==='happy'?150:158} 136 ${mood==='happy'?150:158}" stroke="none"/>`;
  return s + '</svg>';
}
document.querySelectorAll('[data-char]').forEach(el=>{
  const [who,mood] = el.dataset.char.split('-'); el.innerHTML = bust(who,mood);
});

// deterministic random so every render is identical
let seed = 7; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;

// ---------- background sparkles ----------
let sp=''; for(let i=0;i<34;i++) sp+=`<i class="spark" style="left:${rnd()*1060}px;top:${rnd()*1900}px;--t:${4+rnd()*4}s;--d:${-rnd()*8}s"></i>`;
document.getElementById('sparks').innerHTML = sp;
