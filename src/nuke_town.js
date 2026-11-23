// Décor de la scène nucléaire : une petite ville autour de l'observateur, une ville plus grande autour du point zéro.
// Chaque objet reçoit (heure d'arrivée du choc, surpression en psi, chaleur en cal/cm², graine) et tout son état est une fonction du temps :
// on peut donc avancer, reculer ou sauter dans la chronologie sans rien mémoriser.
// Seuils (Glasstone & Dolan) : vitres vers 1 psi, maison en bois gravement endommagée à 2 psi et détruite à 5, béton armé vers 15 à 20,
// forêt couchée vers 3 à 4. La manière de tomber, la poussière et les départs de feu sont une mise en scène.
import { THREE, clamp, sstep, NOISE, rng } from './kit.js';

export const PC_WOOD = (s) => 4 + 2 * s, PC_CONC = (s) => 14 + 8 * s, PC_CITY = (s) => 6 + 10 * s, PF_TREE = (s) => 3 + 1.5 * s, PF_POLE = (s) => 4.5 + 2 * s;

const COMMON = /* glsl */`
uniform float uT,uTime,uKind,uTh,uHz,uDust;uniform vec3 uGZ,uFire,uSun,uAmb,uSunC,uFlashC,uHaze,uCam;
float h1(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}`;
// bâtiments : effondrement, inclinaison, toit arraché
const DEF_B = /* glsl */`
attribute vec4 aI;attribute float aRoof;
float pcOf(float seed){return uKind<.5?4.+2.*seed:(uKind<1.5?14.+8.*seed:6.+10.*seed);}
vec3 deformB(vec3 w,vec3 base,vec3 lp,out float col){
  float ta=aI.x,p=aI.y,seed=aI.w,s=uT-ta;col=0.;
  if(p<0.)return base;
  if(s<=0.)return w;
  vec2 dir=normalize(base.xz-uGZ.xz+vec2(1e-3));float y=w.y-base.y;float pc=pcOf(seed),pl=uKind<.5?1.8:5.;
  if(p>=pc){float tau=(uKind<.5?.45:1.3)*(1.+.6*seed);float a=clamp(s/tau,0.,1.);a=a*a*(3.-2.*a);col=a;
    float r1=h1(lp*7.+seed),r2=h1(lp*11.3+seed+3.),r3=h1(lp*5.1+seed+7.);float over=clamp(p/pc-1.,0.,2.);
    float yy=y*mix(1.,(.16+.26*r1)/(1.+.6*over),a);
    vec2 sh=dir*y*(.55+.5*r2+over*.9)*a+(vec2(r2,r3)-.5)*a*(2.+y*.25);
    return vec3(w.x+sh.x,base.y+yy,w.z+sh.y);}
  float k=smoothstep(pl,pc,p);float lean=k*(.08+.2*seed)*(1.-exp(-s/.35));
  vec3 o=w;o.xz+=dir*y*lean;
  if(aRoof>.5&&k>.3){float a=clamp(s/.7,0.,1.);o.xz+=dir*a*.5*k;o.y=base.y+y*mix(1.,.68+.3*h1(lp*3.+seed),a*k);}
  return o;}`;
// arbres et poteaux : ils plient, se redressent à moitié, ou tombent
const DEF_T = /* glsl */`
attribute vec4 aI;attribute float aCrown;uniform float uPf0,uPf1;
vec3 deformT(vec3 w,vec3 base,float H){
  float ta=aI.x,p=aI.y,seed=aI.w,s=uT-ta;if(p<0.)return base;
  vec2 dir=normalize(base.xz-uGZ.xz+vec2(1e-3));vec3 rel=w-base;float sway=.025*sin(uTime*1.3+seed*40.)*uPf1;
  float pf=uPf0+uPf1*seed,th,rigid=0.;
  if(s<=0.)th=sway;
  else if(p>=pf){float a=clamp(s/(.5+.4*seed),0.,1.);th=1.45*a*a;rigid=1.;}
  else{float k=clamp(p/pf,0.,1.);th=k*(1.05*exp(-s/1.4)*(1.-exp(-s/.12))-.3*exp(-pow((s-3.5)/1.5,2.))+.12*(1.-exp(-s)))+sway;}
  float a=th*mix(clamp(rel.y/H,0.,1.),1.,rigid);float al=dot(rel.xz,dir);vec2 perp=rel.xz-dir*al;
  float al2=al*cos(a)+rel.y*sin(a),y2=-al*sin(a)+rel.y*cos(a);
  return base+vec3(perp.x+dir.x*al2,max(y2,.08),perp.y+dir.y*al2);}`;
const LIGHT = /* glsl */`
vec3 shade(vec3 alb,vec3 emis,vec3 W){vec3 n=normalize(cross(dFdx(W),dFdy(W)));if(dot(n,uCam-W)<0.)n=-n;
  vec3 toF=normalize(uFire-W);vec3 lit=uAmb*(.75+.25*n.y)+uSunC*max(dot(n,uSun),0.)+uFlashC*max(dot(n,toF),0.)*step(0.,uFire.y);
  vec3 c=alb*lit+emis;float d=length(W-uCam);c=mix(c,uHaze,1.-exp(-d*uHz));
  return mix(c,vec3(.62,.56,.47)*(uAmb+uSunC*.5),uDust*.8*(1.-exp(-d/140.)));}`;
const B_VERT = /* glsl */`${COMMON}${DEF_B}
varying vec3 vW,vL,vN,vDim;varying vec4 vI;varying float vCol,vFace,vRoof;
void main(){vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vec3 base=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
  vec3 wp=deformB(w.xyz,base,position,vCol);vW=wp;vL=position;vN=normal;vI=aI;vRoof=aRoof;
  vDim=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
  vec3 nw=normalize(mat3(instanceMatrix)*normal);vFace=dot(nw,normalize(uFire-w.xyz));
  gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`;
const B_FRAG = /* glsl */`precision highp float;${COMMON}${NOISE}${LIGHT}
varying vec3 vW,vL,vN,vDim;varying vec4 vI;varying float vCol,vFace,vRoof;
void main(){float seed=vI.w,p=vI.y,q=vI.z,s=uT-vI.x;vec3 alb;bool side=abs(vN.y)<.5;
  float u=abs(vN.x)>.5?vL.z*vDim.z:vL.x*vDim.x,v=vL.y*vDim.y;float win=0.;
  if(uKind<.5){
    vec3 wall=seed<.3?vec3(.78,.76,.70):seed<.5?vec3(.62,.68,.74):seed<.7?vec3(.74,.66,.50):seed<.85?vec3(.50,.24,.18):vec3(.55,.60,.50);
    vec3 roof=fract(seed*5.3)<.5?vec3(.16,.15,.15):vec3(.30,.13,.10);alb=vRoof>.5?roof:wall;
    if(side&&vRoof<.5){vec2 f=vec2(fract(u/3.2+.5),fract(v/3.));win=step(.28,f.x)*step(f.x,.72)*step(.32,f.y)*step(f.y,.78);alb*=.9+.1*step(.5,fract(v*4.));}
  }else if(uKind<1.5){
    alb=mix(vec3(.50,.50,.49),vec3(.66,.64,.60),fract(seed*3.7));
    if(side){vec2 f=vec2(fract(u/3.6+.5),fract(v/3.4));win=step(.15,f.x)*step(f.x,.85)*step(.3,f.y)*step(f.y,.8);}
    else alb*=.6;
  }else{
    alb=mix(vec3(.36,.35,.34),vec3(.62,.58,.52),fract(seed*3.7));if(fract(seed*9.1)<.25)alb=vec3(.48,.27,.2);
    if(side){vec2 f=vec2(fract(u/5.+.5),fract(v/3.6));win=step(.2,f.x)*step(f.x,.8)*step(.3,f.y)*step(f.y,.8)*clamp(1.5-fwidth(u)*.6,0.,1.);}
    else alb*=.55;
  }
  if(win>.5){float bay=uKind<.5?3.2:(uKind<1.5?3.6:5.);bool broken=s>0.&&p>.6+.8*fract(seed*7.31+floor(u/bay+.5)*.37+floor(v/3.)*.61);alb=mix(alb,broken?vec3(.015):vec3(.10,.14,.20),win*(uKind>1.5?.7:1.));}
  float k=s>0.?smoothstep(uKind<.5?1.8:5.,uKind<.5?5.:16.,p):0.;alb*=1.-.25*k;
  if(side&&vRoof<.5&&k>.12&&uKind<1.5){float hh=h1(vec3(floor(u/3.2+.5),floor(v/3.),floor(seed*31.)+abs(vN.x)*2.+vN.z));if(hh<k*.65)alb=mix(alb,vec3(.03,.028,.025),.92);}
  vec3 rub=uKind<.5?mix(vec3(.30,.23,.16),vec3(.52,.46,.38),h1(floor(vL*9.)+seed)):mix(vec3(.27,.26,.25),vec3(.55,.53,.50),h1(floor(vL*7.)+seed));
  alb=mix(alb,rub,vCol);
  float ch=smoothstep(5.,26.,q)*clamp(vFace*1.6,0.,1.)*uTh*(1.-.5*vCol);alb=mix(alb,vec3(.02),ch*.9);
  vec3 emis=vec3(0.);
  float burn=step(1.-(.15+.55*smoothstep(8.,40.,q)),fract(seed*13.7));
  if(vCol>.5&&burn>.5){float fl=smoothstep(.55,.85,vnoise(vW*.7+vec3(0.,uTime*.6,0.)));emis=vec3(2.6,.7,.12)*fl*smoothstep(2.,14.,s)*exp(-max(s-400.,0.)/300.);}
  gl_FragColor=vec4(shade(alb,emis,vW),1.);}`;
const T_VERT = /* glsl */`${COMMON}${DEF_T}
varying vec3 vW,vL;varying vec4 vI;varying float vCrown,vFace;
void main(){vec3 lp=position;float s=uT-aI.x;
  if(aCrown>.5&&s>0.){float strip=smoothstep(1.,3.,aI.y)*.5+smoothstep(4.,9.,aI.y)*.25;lp=mix(lp,vec3(0.,.72,0.),strip*(1.-exp(-s*3.)));}
  vec4 w=modelMatrix*instanceMatrix*vec4(lp,1.);vec3 base=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;float H=length(instanceMatrix[1].xyz);
  vec3 wp=deformT(w.xyz,base,H);vW=wp;vL=position;vI=aI;vCrown=aCrown;
  vec3 nw=normalize(mat3(instanceMatrix)*normal);vFace=dot(nw,normalize(uFire-w.xyz));
  gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`;
const T_FRAG = /* glsl */`precision highp float;${COMMON}${NOISE}${LIGHT}
uniform float uPf1;
varying vec3 vW,vL;varying vec4 vI;varying float vCrown,vFace;
void main(){float seed=vI.w,p=vI.y,q=vI.z,s=uT-vI.x;vec3 alb=vec3(.15,.10,.065);vec3 emis=vec3(0.);
  if(vCrown>.5){alb=mix(vec3(.05,.15,.04),vec3(.13,.24,.06),fract(seed*6.1))*(.8+.4*h1(floor(vL*14.)));
    float strip=s>0.?smoothstep(1.,3.,p):0.;alb=mix(alb,vec3(.17,.13,.08),strip*.8);
    float ch=smoothstep(5.,22.,q)*clamp(vFace*1.4+.25,0.,1.)*uTh;alb=mix(alb,vec3(.03,.025,.02),ch*.9);
    if(q>14.&&s<0.&&uT>0.){float fl=smoothstep(.5,.8,vnoise(vW*1.3+vec3(0.,uTime*2.,0.)));emis=vec3(2.4,.8,.15)*fl*clamp(vFace+.3,0.,1.)*uTh*smoothstep(14.,30.,q);}
  }else if(uPf1<.5)alb=vec3(.20,.15,.10);
  gl_FragColor=vec4(shade(alb,emis,vW),1.);}`;
const PROJ = /* glsl */`uniform vec4 uLight;
vec4 project(vec3 wp){float y0=.04;vec3 P;
  if(uLight.w<.5)P=wp-uLight.xyz*((wp.y-y0)/uLight.y);
  else{float k=(uLight.y-y0)/max(uLight.y-wp.y,1.);P=uLight.xyz+(wp-uLight.xyz)*k;}
  P.y=y0;return projectionMatrix*viewMatrix*vec4(P,1.);}`;
const SB_VERT = /* glsl */`${COMMON}${DEF_B}${PROJ}
void main(){vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vec3 base=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;float c;gl_Position=project(deformB(w.xyz,base,position,c));}`;
const ST_VERT = /* glsl */`${COMMON}${DEF_T}${PROJ}
void main(){vec3 lp=position;float s=uT-aI.x;if(aCrown>.5&&s>0.){float strip=smoothstep(1.,3.,aI.y)*.5+smoothstep(4.,9.,aI.y)*.25;lp=mix(lp,vec3(0.,.72,0.),strip*(1.-exp(-s*3.)));}
  vec4 w=modelMatrix*instanceMatrix*vec4(lp,1.);vec3 base=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;gl_Position=project(deformT(w.xyz,base,length(instanceMatrix[1].xyz)));}`;
const S_FRAG = 'precision highp float;uniform vec3 uSh;void main(){gl_FragColor=vec4(uSh,1.);}';
// rues : un plan posé sur le sol
const D_VERT = 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
const D_FRAG = /* glsl */`precision highp float;${COMMON}${NOISE}
varying vec3 vW;uniform float uLit,uCity,uRs;
float line(float x,float w){return 1.-smoothstep(w-.4,w+.4,abs(x));}
void main(){vec2 p=vW.xz;vec3 col;float a;
  if(uCity<.5){
    float sx=max(max(line(p.x,4.5),line(abs(p.x)-110.,3.5)),line(abs(p.x)-220.,3.5));float zz=mod(p.y-60.+45.,90.)-45.;float sz=line(zz,3.5);float st=max(sx,sz);
    float wx=max(max(line(p.x,6.5),line(abs(p.x)-110.,5.5)),line(abs(p.x)-220.,5.5));float walk=max(wx,line(zz,5.5));
    col=mix(vec3(.42,.41,.39),vec3(.085,.085,.09),st);col*=.85+.3*vnoise(vec3(p*.8,1.));
    float dash=line(p.x,.12)*step(.5,fract(p.y/8.))*(1.-sz);col=mix(col,vec3(.6,.58,.45),dash*.8);
    a=walk*(1.-smoothstep(380.,450.,length(p-vec2(0.,-110.))));
    if(uLit>0.&&length(p-uGZ.xz)<uRs){col=mix(col,vec3(.36,.33,.29),.3*uLit);float cell=hash31(vec3(floor(p*5.),4.));float lit=step(1.-.2*uLit*(.3+1.4*vnoise(vec3(p*.22,8.))),cell);col=mix(col,mix(vec3(.46,.4,.32),vec3(.13,.115,.1),hash31(vec3(floor(p*5.),9.))),lit);a=max(a,lit*(1.-smoothstep(380.,450.,length(p-vec2(0.,-110.)))));}
  }else{
    vec2 q=p-uGZ.xz;float r=length(q);vec2 c=abs(mod(q,120.)-60.);float st=1.-smoothstep(44.,48.,max(c.x,c.y));
    col=mix(vec3(.2,.2,.2),vec3(.11,.11,.12),1.-st);col*=.8+.4*vnoise(vec3(q*.02,2.));
    float gone=smoothstep(uRs+60.,uRs-60.,r);col=mix(col,vec3(.26,.23,.2)*(.7+.6*vnoise(vec3(q*.05,7.))),gone*.85);
    a=1.-smoothstep(4300.,4700.,r+300.*vnoise(vec3(q*.002,3.)));
  }
  vec3 c=col*(uAmb+(uSunC+uFlashC)*.6);float d=length(vW-uCam);c=mix(c,uHaze,1.-exp(-d*uHz));
  gl_FragColor=vec4(c,a);}`;
// fumées, poussière, flammes : des points dont la position ne dépend que du temps
const P_VERT = /* glsl */`${COMMON}
attribute vec4 aS;attribute float aK;uniform float uPx;varying vec4 vC;
void main(){vec3 o=position;float seed=aS.w,st=aS.z;vec2 dir=normalize(o.xz-uGZ.xz+vec2(1e-3));float size=0.,al=0.;vec3 col=vec3(.5);float add=0.;
  if(st>0.){
    if(aK<.5){float age=uT-aS.x;if(age>0.){o.xz+=dir*(14.+10.*seed)*(1.-exp(-age*.8))*st;o.y+=2.+7.*(1.-exp(-age/4.))*(.5+seed);size=(5.+26.*(1.-exp(-age/3.)))*(.6+.6*st);al=.55*min(st,1.)*exp(-age/20.)*(1.-exp(-age/.25));col=vec3(.56,.5,.42);}}
    else if(aK<1.5){float age=uT-aS.x;if(age>0.&&uT<aS.y){o.y+=1.2*age+.5;o.xz+=vec2(sin(seed*30.),cos(seed*30.))*.3*age;size=1.4+1.6*min(age,6.);al=.5*st*(1.-exp(-age/.25));col=vec3(.2,.19,.18);}}
    else if(aK<2.5){float tt=uT-aS.x;if(tt>0.){float ph=fract(tt/26.+seed);o.y+=3.+ph*70.;o.xz-=dir*ph*ph*30.;o.xz+=vec2(sin(seed*50.),cos(seed*50.))*ph*6.;size=5.+30.*ph;al=.3*sin(3.14159*ph)*min(tt/12.,1.)*exp(-max(tt-500.,0.)/300.);col=vec3(.09,.085,.08);}}
    else{float tt=uT-aS.x;if(tt>0.){o.y+=1.5+seed;size=(3.+1.5*sin(uTime*9.+seed*60.))*min(tt/6.,1.)*exp(-max(tt-400.,0.)/300.);al=1.;add=1.;col=vec3(1.6,.55,.1);}}
  }
  vec4 mv=viewMatrix*vec4(o,1.);gl_Position=projectionMatrix*mv;gl_PointSize=al>0.?min(size*uPx/max(-mv.z,1.),420.):0.;
  vec3 lit=uAmb+uSunC*.6+uFlashC*.4;vC=add>.5?vec4(col,0.):vec4(col*lit,1.)*al;if(al<=0.)gl_Position=vec4(2.,2.,2.,1.);}`;
const P_FRAG = 'precision highp float;varying vec4 vC;void main(){vec2 c=gl_PointCoord-.5;float f=exp(-dot(c,c)*14.)-.03;if(f<=0.)discard;gl_FragColor=vC*f;}';

const cat = (a, b) => { const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
function geoHouse() { // murs (boîte) + toit à deux pentes
  const box = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4).translate(0, 0.5, 0).toNonIndexed(), bp = box.attributes.position.array, bn = box.attributes.normal.array;
  const A = [-0.56, 1, -0.58], B = [0.56, 1, -0.58], C = [0.56, 1, 0.58], Dd = [-0.56, 1, 0.58], E = [-0.56, 1.45, 0], F = [0.56, 1.45, 0];
  const tri = [A, E, F, A, F, B, Dd, C, F, Dd, F, E, A, Dd, E, B, F, C].flat(), rn = new Float32Array(tri.length); for (let i = 1; i < rn.length; i += 3) rn[i] = 1;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(cat(bp, tri), 3)); g.setAttribute('normal', new THREE.BufferAttribute(cat(bn, rn), 3));
  const r = new Float32Array((bp.length + tri.length) / 3); r.fill(1, bp.length / 3); g.setAttribute('aRoof', new THREE.BufferAttribute(r, 1)); return g;
}
function geoBox(sx, sy, sz) { const g = new THREE.BoxGeometry(1, 1, 1, sx, sy, sz).translate(0, 0.5, 0).toNonIndexed(); g.deleteAttribute('uv'); g.setAttribute('aRoof', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); return g; }
function geoTree(pole) {
  const parts = pole ? [new THREE.CylinderGeometry(0.012, 0.016, 1, 5).translate(0, 0.5, 0), new THREE.BoxGeometry(0.2, 0.012, 0.012).translate(0, 0.92, 0)] : [new THREE.CylinderGeometry(0.028, 0.045, 0.56, 6).translate(0, 0.28, 0), new THREE.IcosahedronGeometry(0.3, 1).scale(1, 1.25, 1).translate(0, 0.72, 0)];
  let p = new Float32Array(0), n = new Float32Array(0), c = []; parts.forEach((q, i) => { const g = q.index ? q.toNonIndexed() : q; p = cat(p, g.attributes.position.array); n = cat(n, g.attributes.normal.array); for (let j = 0; j < g.attributes.position.count; j++) c.push(!pole && i === 1 ? 1 : 0); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('aCrown', new THREE.BufferAttribute(new Float32Array(c), 1)); return g;
}

export function makeTown(S) {
  const R = rng(1953), U = { uT: { value: 0 }, uTime: { value: 0 }, uTh: { value: 0 }, uHz: { value: 0 }, uDust: { value: 0 }, uGZ: { value: new THREE.Vector3() }, uFire: { value: new THREE.Vector3(0, 500, -3000) }, uSun: { value: new THREE.Vector3(0, 1, 0) },
    uAmb: { value: new THREE.Color(0.3, 0.33, 0.4) }, uSunC: { value: new THREE.Color(1.05, 0.98, 0.86) }, uFlashC: { value: new THREE.Color(0, 0, 0) }, uHaze: { value: new THREE.Color(0.64, 0.71, 0.84) }, uCam: { value: new THREE.Vector3() } };
  const flashCity = { value: new THREE.Color(0, 0, 0) }, lightSun = { value: new THREE.Vector4(0, 1, 0, 0) }, lightFire = { value: new THREE.Vector4(0, 500, -3000, 1) }, shSun = { value: new THREE.Color() }, shFire = { value: new THREE.Color() };
  const town = new THREE.Group(), city = new THREE.Group(); S.add(town, city);
  const sets = []; // { items:[{x,z,seed}], attr, local, kind }
  function inst(geo, items, vert, frag, extra, parent, shadowVert) {
    const n = items.length, attr = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); geo.setAttribute('aI', attr);
    const mk = (v, f, u, o) => { const m = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ vertexShader: v, fragmentShader: f, uniforms: { ...U, ...u }, ...o }), n); m.frustumCulled = false; return m; };
    const main = mk(vert, frag, extra, { transparent: true, blending: THREE.NoBlending, depthWrite: true, side: THREE.DoubleSide }); main.renderOrder = 3;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), po = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    items.forEach((it, i) => { q.setFromAxisAngle(up, it.yaw || 0); M.compose(po.set(it.x, 0, it.z), q, sc.set(it.w, it.h, it.d)); main.setMatrixAt(i, M); }); parent.add(main);
    const sh = []; if (shadowVert) for (const [L, C] of [[lightSun, shSun], [lightFire, shFire]]) { const m = mk(shadowVert, S_FRAG, { ...extra, uLight: L, uSh: C }, { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.MinEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }); m.instanceMatrix = main.instanceMatrix; m.renderOrder = 2; parent.add(m); sh.push(m); }
    return { items, attr, main, sh };
  }
  // ---- la petite ville de l'observateur : rues nord-sud en x = 0, ±110, ±220 ; rues est-ouest tous les 90 m
  const XS = [0, 110, -110, 220, -220], ZS = [150, 60, -30, -120, -210, -300, -390], nearZ = (z, m) => ZS.some(c => Math.abs(z - c) < m);
  const CONC = [[26, -66, 20, 18, 16], [-27, -160, 22, 24, 18], [28, -255, 24, 30, 16], [-30, -340, 20, 21, 20], [138, -75, 22, 15, 18], [-140, -250, 20, 27, 16], [-26, 105, 18, 15, 16], [84, -165, 18, 18, 20]]; // x, z, largeur, hauteur, profondeur
  const houses = [], concs = CONC.map(c => ({ x: c[0], z: c[1], w: c[2], h: c[3], d: c[4], seed: R() })), trees = [], poles = [];
  const free = (x, z, m) => !concs.some(c => Math.abs(x - c.x) < c.w / 2 + m && Math.abs(z - c.z) < c.d / 2 + m);
  for (const X of XS) for (const sd of [-1, 1]) for (let z = -412; z <= 185; z += 21) {
    if (nearZ(z, 13) || R() < 0.12) continue; const hw = X === 0 ? 17 : 15, x = X + sd * hw; if (!free(x, z, 9) || Math.hypot(x, z + 110) > 440) continue;
    houses.push({ x, z: z + (R() - 0.5) * 3, w: 8 + R() * 2.5, h: R() < 0.55 ? 5.6 : 3.2, d: 9 + R() * 3, yaw: Math.PI / 2 + (R() - 0.5) * 0.06, seed: R() });
  }
  for (const X of XS) for (const sd of [-1, 1]) for (let z = -405; z <= 180; z += 15) { if (nearZ(z, 9) || R() < 0.25) continue; const x = X + sd * (X === 0 ? 8 : 7); if (free(x, z, 3)) trees.push({ x, z, s: 6 + R() * 5, seed: R() }); }
  for (let i = 0; i < 170; i++) { const X = XS[Math.floor(R() * 5)], x = X + (R() < 0.5 ? -1 : 1) * (30 + R() * 25), z = -415 + R() * 600; if (!nearZ(z, 8) && free(x, z, 5) && Math.abs(x) > 12) trees.push({ x, z, s: 7 + R() * 8, seed: R() }); }
  trees.forEach(t => { t.w = t.h = t.d = t.s; t.yaw = R() * 6; });
  for (let z = -400; z <= 180; z += 45) poles.push({ x: -6.2, z: z + 8, w: 9, h: 9, d: 9, yaw: Math.PI / 2, seed: R() });
  for (const Z of ZS) for (let x = -200; x <= 200; x += 50) if (Math.abs(x) > 12) poles.push({ x, z: Z + 5.2, w: 9, h: 9, d: 9, yaw: 0, seed: R() });
  const kHouse = inst(geoHouse(), houses, B_VERT, B_FRAG, { uKind: { value: 0 } }, town, SB_VERT), kConc = inst(geoBox(5, 7, 4), concs, B_VERT, B_FRAG, { uKind: { value: 1 } }, town, SB_VERT);
  const kTree = inst(geoTree(false), trees, T_VERT, T_FRAG, { uKind: { value: 0 }, uPf0: { value: 3 }, uPf1: { value: 1.5 } }, town, ST_VERT), kPole = inst(geoTree(true), poles, T_VERT, T_FRAG, { uKind: { value: 0 }, uPf0: { value: 4.5 }, uPf1: { value: 0.0001 } }, town, ST_VERT);
  // ---- la ville du point zéro : des îlots de 120 m, jusqu'à 4,5 km
  const blocks = []; for (let i = -38; i <= 38; i++) for (let j = -38; j <= 38; j++) { const x = i * 120 + 60, z = j * 120 + 60, r = Math.hypot(x, z); if (r > 4400 + 300 * Math.sin(Math.atan2(z, x) * 3) || R() < 0.1 + 0.25 * sstep(2500, 4500, r)) continue;
    blocks.push({ x, z, w: 70 + R() * 22, d: 70 + R() * 22, h: 7 + R() * (10 + 55 * Math.exp(-r / 1100) * R()), seed: R() }); }
  const kCity = inst(geoBox(2, 3, 2), blocks, B_VERT, B_FRAG, { uKind: { value: 2 }, uFlashC: flashCity }, city, null);
  // ---- rues
  const mkDecal = (geo, u) => { const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: D_VERT, fragmentShader: D_FRAG, uniforms: { ...U, ...u }, transparent: true, depthTest: false, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.frustumCulled = false; return m; };
  const uLit = { value: 0 }, uRs = { value: 0 }, streets = mkDecal(new THREE.PlaneGeometry(940, 940), { uCity: { value: 0 }, uLit, uRs }); streets.position.set(0, 0.02, -110); town.add(streets);
  const cityGround = mkDecal(new THREE.CircleGeometry(5200, 64), { uCity: { value: 1 }, uLit, uRs, uFlashC: flashCity }); cityGround.position.y = 0.5; city.add(cityGround);
  // ---- fumées et poussières
  const parts = []; const addP = (o, k, n, y) => { for (let i = 0; i < n; i++) parts.push({ o, k, x: o.x + (R() - 0.5) * (o.w || 4) * 0.8, y: y * (0.3 + 0.7 * R()), z: o.z + (R() - 0.5) * (o.d || 4) * 0.8, seed: R() }); };
  houses.forEach(h => { h.kind = 0; addP(h, 0, 3, 4); addP(h, 1, 2, h.h); addP(h, 2, 4, 2); addP(h, 3, 2, 1); });
  concs.forEach(c => { c.kind = 1; addP(c, 0, 8, c.h * 0.5); addP(c, 2, 5, 3); addP(c, 3, 2, 1); });
  trees.forEach(t => { t.kind = 3; addP(t, 1, 1, t.s * 0.8); });
  const pg = new THREE.BufferGeometry(), pp = new Float32Array(parts.length * 3), pk = new Float32Array(parts.length), ps = new THREE.BufferAttribute(new Float32Array(parts.length * 4), 4);
  parts.forEach((p, i) => { pp.set([p.x, p.y, p.z], i * 3); pk[i] = p.k; }); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aK', new THREE.BufferAttribute(pk, 1)); pg.setAttribute('aS', ps);
  const uPx = { value: 600 }, puffs = new THREE.Points(pg, new THREE.ShaderMaterial({ vertexShader: P_VERT, fragmentShader: P_FRAG, uniforms: { ...U, uKind: { value: 0 }, uPx }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
  puffs.frustumCulled = false; puffs.renderOrder = 3.5; town.add(puffs);
  const burning = (o, pc) => o.p >= pc && (o.seed * 13.7) % 1 > 1 - (0.15 + 0.55 * sstep(8, 40, o.q));
  return {
    U, town, city, houses, trees, concs,
    // fx(g) → [arrivée (s), surpression (psi), chaleur (cal/cm²)] à la distance au sol g du point zéro
    layout(D, fx) {
      const fill = (k, f, dz) => { k.items.forEach((o, i) => { const g = Math.hypot(o.x, o.z + dz), v = fx(g); o.ta = v[0]; o.p = f && f(o) ? -1 : v[1]; o.q = v[2]; k.attr.setXYZW(i, o.ta, o.p, o.q, o.seed); }); k.attr.needsUpdate = true; };
      fill(kHouse, null, D); fill(kConc, null, D); fill(kTree, null, D); fill(kPole, null, D); fill(kCity, (o) => Math.hypot(o.x, o.z - D) < 560, 0);
      parts.forEach((p, i) => { const o = p.o, pc = o.kind === 0 ? PC_WOOD(o.seed) : PC_CONC(o.seed), fall = o.p >= pc; let a = 0, b = o.ta, st = 0;
        if (p.k === 0) { a = o.ta + p.seed * 0.5; st = o.kind === 3 ? 0 : fall ? 1 + (o.kind === 1 ? 0.8 : 0) : 0.5 * sstep(1.5, 4, o.p); }
        else if (p.k === 1) { a = 0.15 + p.seed * 0.5; st = sstep(6, 22, o.q) * (b > a + 0.3 ? 1 : 0); }
        else { a = o.ta + 4 + p.seed * 25; st = o.kind !== 3 && burning(o, pc) ? 1 : 0; }
        ps.setXYZW(i, a, b, st, p.seed); }); ps.needsUpdate = true;
    },
    // nombre de maisons effondrées et d'arbres abattus à l'instant t
    stats(t) { let h = 0, a = 0; for (const o of houses) if (t >= o.ta && o.p >= PC_WOOD(o.seed)) h++; for (const o of trees) if (t >= o.ta && o.p >= PF_TREE(o.seed)) a++; return [h, houses.length, a, trees.length]; },
    update(o) { // o : t, time, D, drop, fire (Vector3), sun, flash, flashGZ, th, hz, dust, rs, pObs, tArr, gnd, visible
      town.visible = city.visible = o.visible; if (!o.visible) return;
      U.uT.value = o.t; U.uTime.value = o.time; U.uTh.value = o.th; U.uHz.value = o.hz; U.uDust.value = o.dust; U.uGZ.value.set(0, 0, -o.D); U.uFire.value.copy(o.fire); U.uSun.value.copy(o.sun);
      U.uFlashC.value.setRGB(6 * o.flash, 5.6 * o.flash, 5 * o.flash); flashCity.value.setRGB(6 * o.flashGZ, 5.6 * o.flashGZ, 5 * o.flashGZ);
      city.position.set(0, -o.drop, -o.D); cityGround.visible = !o.gnd; uRs.value = o.rs; uLit.value = clamp(o.pObs / 5, 0, 1);
      lightSun.value.set(o.sun.x, o.sun.y, o.sun.z, 0); lightFire.value.set(o.fire.x, o.fire.y, o.fire.z, 1);
      // couleur du sol à l'ombre : ce qu'il reste quand la source masquée est retirée
      const a = U.uAmb.value, g = [0.17, 0.2, 0.076], fl = 6 * o.flash * 0.6, su = 1.05 * 0.6; shSun.value.setRGB(g[0] * (a.r + fl), g[1] * (a.g + fl * 0.93), g[2] * (a.b + fl * 0.83)); shFire.value.setRGB(g[0] * (a.r + su), g[1] * (a.g + su * 0.93), g[2] * (a.b + su * 0.82));
      const fireOn = o.flash > 0.03 && o.fire.y > 40; for (const k of [kHouse, kConc, kTree, kPole]) { k.sh[0].visible = true; k.sh[1].visible = fireOn; }
    },
    post(camera, h) { U.uCam.value.copy(camera.position); uPx.value = h / (2 * Math.tan(camera.fov * Math.PI / 360)); },
  };
}
