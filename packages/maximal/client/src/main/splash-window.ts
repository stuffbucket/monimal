import { BrowserWindow } from 'electron';

import {
  FRAUNCES_FONT_DATA,
  MAXIMAL_PAINT_CANDY,
} from '@stuffbucket/maximal-assets/brand'

const MAX_LIFETIME_MS = 10_000;
const MIN_DISPLAY_MS = 5_000;

let splash: BrowserWindow | undefined;
let killTimer: NodeJS.Timeout | undefined;
let minDisplayTimer: NodeJS.Timeout | undefined;
let shownAt = 0;

function markup(name: string, version: string): string {
  const escapedName = name.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:">
<title>${escapedName}</title><style>
@font-face{font-family:Fraunces;src:url(${FRAUNCES_FONT_DATA}) format('woff2');font-style:normal;font-weight:400 900;font-display:block}
html,body{margin:0;height:100%;background:transparent;overflow:hidden;user-select:none;cursor:default}
.splash{box-sizing:border-box;position:fixed;inset:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:0;padding:34px 39px 40px;border-radius:14px;background:#c8334a;outline:.25px solid rgb(0 0 0/.72);outline-offset:0;box-shadow:0 1px 2px rgb(0 0 0/.18),0 2px 4px rgb(0 0 0/.14),0 8px 16px rgb(0 0 0/.12);font:400 13px/1.5 'Commissioner',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f4ead4;text-align:left;overflow:hidden;transition:opacity 200ms ease-out;-webkit-app-region:drag}
.paint{position:absolute;inset:0;z-index:0;display:block;width:100%;height:100%;pointer-events:none}.content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-start;gap:0}.wordmark{display:block;width:100%;max-width:802px;margin:0 0 .75rem;background:linear-gradient(180deg,#fcf5e6 0%,#f1e5cb 55%,#d6c4a0 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-family:Fraunces,Georgia,'Times New Roman',serif;font-size:128px;font-weight:900;font-style:normal;font-variation-settings:'SOFT' 30,'WONK' 1,'opsz' 144;line-height:.92;letter-spacing:-.04em;filter:drop-shadow(0 5px 9px rgb(26 0 4/.5))}.status{min-height:1.6em;font-size:16px;line-height:1.6;letter-spacing:0;color:#f0e9d6;opacity:.82}.version{position:absolute;bottom:12px;left:0;right:0;font-size:11px;line-height:1.4;letter-spacing:.02em;color:#f0e9d6;opacity:.5;text-align:center}
</style></head><body><div class="splash"><canvas class="paint" aria-hidden="true"></canvas><div class="content"><div class="wordmark">${escapedName}</div><div class="status">Starting the proxy…</div></div><div class="version">${version && version !== '0.0.0' ? `v${version}` : ''}</div></div><script type="x-shader/x-vertex" id="vertex">attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}</script><script type="x-shader/x-fragment" id="fragment">precision highp float;uniform vec2 uRes;uniform float uTime;const vec3 base=vec3(${MAXIMAL_PAINT_CANDY.baseRgb.join(',')});const vec3 sheen=vec3(1.,.95,.9);float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}vec2 hash2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5);}float coatH(vec2 p){return sin(p.x*1.7+1.3)*.5+sin(p.y*2.-.7)*.5+sin((p.x+p.y)*1.15+2.1)*.35;}float flakes(vec2 q,float scale,float seed){vec2 g=q*scale+seed,id=floor(g),f=fract(g);float outv=0.;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 cell=vec2(float(x),float(y)),c=id+cell,r=hash2(c);float d=length(f-(cell+r));float present=step(.55,hash(c+7.)),size=.18+.22*hash(c+3.);outv+=present*smoothstep(size,0.,d)*pow(.5+.5*sin(r.x*6.28+uTime*1.6),8.);}}return outv;}void main(){vec2 uv=gl_FragCoord.xy/uRes,q=vec2(uv.x*uRes.x/uRes.y,uv.y);float drift=sin(uTime*.12)*.5;float light=pow(smoothstep(-.15,1.05,uv.y+drift*(uv.x-.5)*.12),1.5);vec3 col=mix(base*.45,base,smoothstep(-1.1,1.3,uv.y));float flake=flakes(q,${MAXIMAL_PAINT_CANDY.flakeScales[0]}.,0.)*.6+flakes(q,${MAXIMAL_PAINT_CANDY.flakeScales[1]}.,17.3)*.4;col+=vec3(1.,.96,.92)*flake*(.3+light*.8);col+=sheen*light*${MAXIMAL_PAINT_CANDY.sheen};gl_FragColor=vec4(col,1.);}</script><script>(()=>{const c=document.querySelector('.paint'),gl=c.getContext('webgl',{alpha:false,antialias:false,depth:false,powerPreference:'low-power'});if(!gl)return;const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);return s};const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,document.querySelector('#vertex').textContent),f=compile(gl.FRAGMENT_SHADER,document.querySelector('#fragment').textContent);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.useProgram(p);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const a=gl.getAttribLocation(p,'p');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);const r=gl.getUniformLocation(p,'uRes'),t=gl.getUniformLocation(p,'uTime'),start=performance.now();const resize=()=>{const d=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(c.clientWidth*d)),h=Math.max(1,Math.round(c.clientHeight*d));if(c.width===w&&c.height===h)return;c.width=w;c.height=h;gl.viewport(0,0,w,h);gl.uniform2f(r,w,h)};const frame=now=>{resize();gl.uniform1f(t,(now-start)/1000);gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(frame)};requestAnimationFrame(frame)})();</script></body></html>`;

}

export function createSplashWindow({
  name = 'maximal',
  version = '',
  dismissAfterMs = MAX_LIFETIME_MS,
}: { name?: string; version?: string; dismissAfterMs?: number | false } = {}): BrowserWindow {
  splash = new BrowserWindow({
    width: 880,
    height: 480,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    backgroundColor: '#00000000',
    hasShadow: false,
  });

  void splash.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(markup(name, version))}`);
  splash.once('ready-to-show', () => {
    shownAt = Date.now();
    splash?.show();
  });
  if (dismissAfterMs !== false) {
    killTimer = setTimeout(closeSplashWindow, dismissAfterMs);
  }
  splash.on('closed', () => {
    splash = undefined;
  });
  return splash;
}

export function closeSplashWindow(immediate = false): void {
  if (killTimer) {
    clearTimeout(killTimer);
    killTimer = undefined;
  }
  if (!immediate && shownAt !== 0) {
    const remaining = MIN_DISPLAY_MS - (Date.now() - shownAt);
    if (remaining > 0) {
      if (!minDisplayTimer) {
        minDisplayTimer = setTimeout(() => {
          minDisplayTimer = undefined;
          closeSplashWindow(true);
        }, remaining);
      }
      return;
    }
  }
  if (minDisplayTimer) {
    clearTimeout(minDisplayTimer);
    minDisplayTimer = undefined;
  }
  if (splash && !splash.isDestroyed()) splash.close();
  splash = undefined;
  shownAt = 0;
}