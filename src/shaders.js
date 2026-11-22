// GLSL partagé : bruit, relief analytique, ciel complet (dégradé, nuages, Lune, astéroïde, panache)
export const NI = 9;

export const COMMON = /* glsl */`
uniform float uTime;
uniform float uT;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunVis;
uniform vec3 uGZ;
uniform vec3 uGZr;
uniform float uDust;
uniform float uGlow;
uniform float uStreak;
uniform float uFire;
uniform vec3 uFireCol;
uniform vec3 uFireDir;
uniform vec3 uAstDir;
uniform vec3 uAstEntry;
uniform float uTrail;
uniform float uTrailW;
uniform float uAstGlow;
uniform float uAstAng;
uniform float uAstBody;
uniform vec3 uMoonDir;
uniform float uWater;
uniform float uChop;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform vec3 uAmb;
uniform float uD;
uniform float uDrop;
uniform float uEngulf;
uniform float uInnerEm;
uniform float uMelt;
uniform float uAsh;
uniform float uRain;
uniform float uDep;
uniform float uBead;
uniform float uHot;
uniform float uFroth;
uniform vec3 uPathA;
uniform vec3 uPathB;
uniform vec2 uTsuDir;
uniform float uTsuFront;
uniform float uTsuH;
uniform vec4 uIslA[${NI}];
uniform vec4 uIslB[${NI}];

float sq(float x){ return x*x; }
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash21(i), b=hash21(i+vec2(1.0,0.0)), c=hash21(i+vec2(0.0,1.0)), d=hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p, int oct){
  float s=0.0, a=0.5;
  for(int i=0;i<6;i++){ if(i>=oct) break; s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=0.5; }
  return s;
}
float terrainH(vec2 p){
  float r=length(p);
  float h=-2.2-min(r,4000.0)*0.0045+0.35*sin(p.x*0.031+1.3)*sin(p.y*0.027+0.4)+0.12*sin(p.x*0.11+p.y*0.07);
  for(int i=0;i<${NI};i++){
    vec2 q=p-uIslA[i].xy;
    vec2 rq=vec2(q.x*uIslB[i].x+q.y*uIslB[i].y, -q.x*uIslB[i].y+q.y*uIslB[i].x);
    h+=uIslB[i].z*exp(-(rq.x*rq.x*uIslA[i].z+rq.y*rq.y*uIslA[i].w));
  }
  return h+uDep;
}
float waterY(vec2 p){
  float y=uWater;
  if(uTsuH>0.0){
    float s=dot(p,uTsuDir)-uTsuFront;
    float W=140.0;
    float k=1.0-smoothstep(-W,W*0.25,s);
    float sm=min(s,0.0);
    float body=uTsuH*exp(sm/9000.0)*(0.62+0.38*cos(sm/1400.0))*(1.0+0.30*exp(-sq((s+W*1.4)/(W*0.9))));
    y=mix(y,body,k);
  }
  return y;
}
vec3 applyFog(vec3 c, float dist){
  float f=1.0-exp(-sq(dist*uFogDen));
  return mix(c,uFogCol,f);
}
`;

export const SKY = /* glsl */`
vec3 skyGradient(vec3 d){
  float y=max(d.y,0.0);
  float t=1.0-pow(y+1e-6,0.42);
  vec3 zen=vec3(0.09,0.15,0.52), mid=vec3(0.33,0.36,0.78), hor=vec3(0.96,0.66,0.62);
  vec3 c=mix(zen,mid,smoothstep(0.0,0.55,t));
  c=mix(c,hor,smoothstep(0.42,1.0,t));
  float sd=max(dot(d,uSunDir),0.0);
  c+=vec3(1.0,0.60,0.34)*pow(sd,5.0)*0.16*uSunVis;
  c+=vec3(1.0,0.80,0.55)*pow(sd,40.0)*0.30*uSunVis;
  return c;
}
void skyBody(vec3 d, vec3 bd, float ar, vec3 alb, float rough, float spin, vec3 amb, vec3 L, inout vec3 c){
  float cd=dot(d,bd);
  if(cd<cos(ar*1.4)) return;
  vec3 u=normalize(cross(vec3(0.0,1.0,0.0),bd)+vec3(1e-5,0.0,0.0)); vec3 v=cross(bd,u);
  vec2 p=vec2(dot(d,u),dot(d,v))/ar;
  float ang=atan(p.y,p.x+1e-7)+spin;
  vec2 cs=vec2(cos(ang),sin(ang));
  float lim=1.0+rough*(vnoise(cs*1.4+5.0)-0.5)+rough*0.5*(vnoise(cs*3.7+9.0)-0.5);
  float rr=dot(p,p)/(lim*lim);
  if(rr>=1.0) return;
  vec3 n=normalize(p.x*u+p.y*v-sqrt(max(1.0-rr,0.0))*bd);
  float bump=vnoise(p*5.0+11.0+spin)-0.5;
  n=normalize(n+rough*2.0*bump*(u+v));
  float l=max(dot(n,L),0.0);
  float edge=smoothstep(1.0,0.80,rr);
  c+=alb*(l+amb)*edge*(1.0-0.9*uDust);
}
vec4 plume(vec3 d, int q){
  float t=uT;
  if(t<=0.0||uD<150.0) return vec4(0.0);
  float hl=length(d.xz);
  if(hl<1e-4) return vec4(0.0);
  vec3 dh=vec3(d.x,0.0,d.z)/hl;
  float ca=dot(dh,uGZ);
  if(ca<0.2) return vec4(0.0);
  float X=uD*dot(dh,uGZr)/ca;
  float Y=uD*(d.y/hl)/ca+uDrop;
  float Rf=150.0*(1.0-exp(-t/2.5));
  float H=min(max(Rf,20.0+5.5*pow(max(t,1e-4),0.92)),2200.0);
  float w0=Rf*0.9+0.0049*t*t;
  float yy=clamp(Y/H,0.0,1.0);
  float w=w0*(1.0+1.4*pow(yy+1e-6,0.7)*smoothstep(8.0,60.0,t))*sqrt(max(1.0-yy*yy*yy,0.0));
  vec2 np=vec2(X,Y)/(60.0+0.25*H);
  float n=fbm(np*1.6+vec2(0.0,-t*0.012), q==1?5:3);
  float n2=fbm(np*4.3+vec2(3.1,-t*0.035), q==1?4:2);
  float e=(w-abs(X))/max(w,1.0)+(n-0.5)*0.55;
  float a=smoothstep(0.0,0.10,e)*(1.0-smoothstep(0.93,1.0,yy+(n-0.5)*0.15));
  if(a<=0.0) return vec4(0.0);
  float core=smoothstep(0.0,0.8,e);
  float hot=exp(-t/14.0);
  vec3 dark=mix(vec3(0.17,0.11,0.085),vec3(0.40,0.34,0.33),yy)*(0.22+0.9*(1.0-0.93*uDust));
  dark*=0.55+0.9*n2;
  dark+=uSunCol*0.05*max(dot(dh,uGZr)*0.0+n-0.35,0.0)*smoothstep(0.2,0.9,yy);
  vec3 em=vec3(1.0,0.86,0.62)*30.0*hot*core
    +vec3(1.0,0.36,0.07)*5.0*exp(-t/260.0)*smoothstep(0.42,0.72,n2+core*0.2-yy*0.38)
    +vec3(1.0,0.25,0.04)*3.5*exp(-max(Y-uDrop,0.0)/(70.0+t*0.35))*exp(-t/1100.0);
  float thin=mix(1.0,0.8,smoothstep(0.55,1.0,yy));
  return vec4(dark+em,a*thin);
}
vec4 clouds(vec3 d, int q){
  if(d.y<0.012) return vec4(0.0);
  vec2 p=d.xz/(d.y+0.16)*2.1+uTime*vec2(0.0045,0.0018);
  float big=vnoise(p*0.33+3.7);
  float n=fbm(p,q==1?6:4)+0.22*(big-0.5);
  float th=0.60;
  float a=smoothstep(th,th+0.13,n);
  // couloir dégagé le long de la trajectoire de l'astéroïde : aucun nuage ne doit le masquer
  vec3 pab=uPathB-uPathA;
  float ptp=clamp(dot(d-uPathA,pab)/max(dot(pab,pab),1e-6),0.0,1.0);
  float ppd=length(d-normalize(uPathA+pab*ptp))+(n-0.6)*0.12;
  a*=smoothstep(0.15,0.36,ppd);
  if(a<=0.0) return vec4(0.0);
  float lit=1.0;
  if(q==1){
    float n2=fbm(p+normalize(uSunDir.xz+1e-4)*0.11,5)+0.22*(big-0.5);
    lit=exp(-max(n2-th,0.0)*7.0);
  }
  float day=1.0-0.93*uDust;
  vec3 shade=vec3(0.52,0.47,0.70), bright=vec3(1.12,0.98,0.94);
  vec3 c=mix(shade,bright,lit*(0.35+0.65*smoothstep(th,th+0.3,n)))*day*(0.35+0.65*uSunVis+0.0);
  c+=vec3(1.0,0.55,0.35)*0.25*pow(max(dot(d,uSunDir),0.0),8.0)*uSunVis;
  float gf=0.5+0.5*dot(normalize(d.xz+1e-5),uGZ.xz);
  c+=uFireCol*uFire*(0.05+0.22*gf*gf);
  c+=vec3(1.0,0.30,0.07)*uGlow*0.22;
  a*=smoothstep(0.012,0.10,d.y)*(1.0-0.5*uDust);
  return vec4(c,a);
}
float streaks(vec3 d, float N, float seed){
  float cr=dot(d,uGZ);
  float rho=acos(clamp(cr,-1.0,1.0));
  vec3 perp=d-uGZ*cr;
  float phi=atan(dot(perp,uGZr),perp.y+1e-7);
  float cell=phi*N/6.28318+seed;
  float id=floor(cell), f=fract(cell);
  float h=hash21(vec2(id,seed)), h2=hash21(vec2(id,seed+7.0));
  float lw=0.03/max(sin(rho),0.12);
  float line=smoothstep(lw,0.0,abs(f-0.5));
  float head=fract(h*9.0+uTime*(0.04+0.09*h2))*3.4;
  float s=head-rho;
  return line*step(0.0,s)*exp(-s*(13.0+22.0*h))*step(h2,0.8);
}
vec3 skyAll(vec3 d, int q){
  float day=1.0-0.93*uDust;
  vec3 c=skyGradient(d)*day;
  float sd=max(dot(d,uSunDir),0.0);
  if(q==1){
    skyBody(d,uMoonDir,0.0046,vec3(1.05,1.02,0.95),0.0,0.0,vec3(0.012),uSunDir,c);
    if(uAstBody>0.0) skyBody(d,uAstDir,uAstAng,vec3(0.80,0.74,0.66)*uAstBody,0.34,uTime*0.05,vec3(0.20,0.23,0.27),normalize(uSunDir-uAstDir*max(dot(uSunDir,uAstDir)+0.5,0.0)),c);
    c+=uSunCol*uSunVis*(smoothstep(0.99996,0.99999,sd)*16.0+pow(sd,900.0)*1.0);
  } else {
    c+=uSunCol*uSunVis*(pow(sd,1600.0)*6.0+pow(sd,220.0)*0.3);
  }
  vec3 gz=normalize(uFireDir+vec3(0.0,0.02,0.0));
  d=normalize(d+vec3(0.0,1e-6,0.0));
  float gd=max(dot(d,gz),0.0);
  c+=uFireCol*uFire*(0.015+0.03*pow(gd,3.0)+0.12*pow(gd,24.0));
  vec4 pl=plume(d,q); c=mix(c,pl.rgb,pl.a);
  vec4 cl=clouds(d,q); c=mix(c,cl.rgb,cl.a);
  if(uEngulf>0.0){
    vec2 q2=d.xz/(abs(d.y)+0.25);
    float en=fbm(q2*1.3+uTime*0.012,q==1?5:3);
    vec3 inner=vec3(0.11,0.07,0.055)*(0.35+1.3*en)*(0.25+day)
      +vec3(1.0,0.42,0.09)*uInnerEm*(0.25+1.6*smoothstep(0.40,0.78,en));
    c=mix(c,inner,uEngulf*0.92);
    cl.a*=1.0-uEngulf;
  }
  if(uGlow>0.0){
    float gn=q==1?fbm(d.xz/(abs(d.y)+0.3)*2.0+uTime*0.02,3):0.5;
    c+=vec3(1.0,0.30,0.06)*uGlow*(0.14+0.34*gn)*(0.55+0.45*(1.0-abs(d.y)));
  }
  if(uStreak>0.0){
    float st=streaks(d,70.0,1.0)+0.7*streaks(d,131.0,5.0);
    if(q==1) st+=0.5*streaks(d,211.0,9.0);
    c+=vec3(1.0,0.62,0.30)*st*uStreak*2.6*(1.0-0.6*cl.a);
  }
  if(uAstGlow>0.0){
    float ad=max(dot(d,uAstDir),0.0);
    vec3 gcol=vec3(1.0,0.92,0.78);
    float g=pow(ad,9000.0)*160.0+pow(ad,500.0)*0.9+pow(ad,24.0)*0.10+pow(ad,3.0)*0.04;
    c+=gcol*uAstGlow*g*(1.0-0.45*cl.a);
  }
  if(uTrail>0.0){
    vec3 ab=uAstDir-uAstEntry;
    float tp=clamp(dot(d-uAstEntry,ab)/max(dot(ab,ab),1e-8),0.0,1.0);
    float pd=length(d-(uAstEntry+ab*tp));
    float sig=0.0022+0.007*(1.0-tp)+uTrailW;
    float tr=exp(-pd*pd/(sig*sig))*(0.25+0.75*tp*tp);
    float halo=exp(-pd*pd/(sig*sig*30.0))*0.05;
    c+=vec3(1.0,0.86,0.66)*uTrail*(tr*7.0+halo)*(1.0-0.45*cl.a);
  }
  return c;
}
`;

export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir=position; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_Position.z=gl_Position.w*0.99999; }
`;
export const SKY_FRAG = /* glsl */`
${COMMON}
${SKY}
varying vec3 vDir;
void main(){
  vec3 d=normalize(vDir);
  vec3 c=skyAll(d,1);
  if(d.y<0.0) c=mix(c,uFogCol,smoothstep(0.0,-0.02,d.y));
  gl_FragColor=vec4(c,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const WORLD_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }
`;

export const WATER_VERT = /* glsl */`
${COMMON}
varying vec3 vW; varying vec3 vN;
void main(){ vec4 w=modelMatrix*vec4(position,1.0); w.y=waterY(w.xz); vW=w.xyz; vN=vec3(0.0,1.0,0.0); gl_Position=projectionMatrix*viewMatrix*w; }
`;
export const WATER_FRAG = /* glsl */`
${COMMON}
${SKY}
uniform vec3 uWaterLight;
varying vec3 vW; varying vec3 vN;
// ronds d'impact : un point qui éclate en anneau, case par case
float rings(vec2 g){
  vec2 id=floor(g); vec2 f=fract(g)-0.5;
  float h=hash21(id);
  float ph=fract(uTime*(1.6+1.4*h)+h*7.0);
  vec2 c=(vec2(hash21(id+1.7),hash21(id+5.3))-0.5)*0.55;
  float r=length(f-c);
  float ring=smoothstep(0.045,0.0,abs(r-ph*0.36))*(1.0-ph)*(1.0-ph);
  float dotc=smoothstep(0.075,0.0,r)*smoothstep(0.22,0.0,ph);
  return ring*0.7+dotc*1.2;
}
#define WAVE(dx,dy,k,w,a) { vec2 dd=normalize(vec2(dx,dy)); float ff=1.0/(1.0+sq(dist*(k)/260.0)); g+=dd*(k)*(a)*ff*cos(dot(dd,p)*(k)+uTime*(w)); }
void main(){
  vec2 p=vW.xz;
  float h=terrainH(p);
  float lap=0.035*sin(uTime*0.9+p.x*0.05+p.y*0.07);
  float depth=(vW.y+lap)-h;
  if(depth<=0.0) discard;
  vec3 V=cameraPosition-vW; float dist=length(V); V/=dist;
  vec2 g=vec2(0.0);
  WAVE(1.0,0.3,0.35,0.9,0.05)
  WAVE(-0.4,1.0,0.8,1.4,0.035)
  WAVE(0.7,-0.6,1.7,2.1,0.02)
  WAVE(-0.8,-0.5,3.1,3.0,0.012)
  WAVE(0.2,1.0,5.3,4.1,0.007)
  WAVE(1.0,-0.1,9.0,5.5,0.004)
  float f2=1.0/(1.0+dist*0.02);
  vec2 q=p*1.1+uTime*vec2(0.35,0.22); float e=0.3;
  float n0=vnoise(q);
  g+=(vec2(vnoise(q+vec2(e,0.0)),vnoise(q+vec2(0.0,e)))-n0)/e*0.09*f2;
  g*=uChop*(0.35+0.65*smoothstep(0.0,0.8,depth));
  float tfoam=0.0;
  if(uTsuH>0.0){
    float e2=4.0; float y0=waterY(p);
    vec2 gb=vec2(waterY(p+vec2(e2,0.0))-y0,waterY(p+vec2(0.0,e2))-y0)/e2;
    float s=dot(p,uTsuDir)-uTsuFront;
    float turb=fbm(p*0.045+uTime*vec2(0.5,0.3),4);
    float turb2=vnoise(p*0.35+uTime*vec2(1.3,0.8));
    vec2 perp=vec2(-uTsuDir.y,uTsuDir.x);
    float strk=vnoise(vec2(dot(p,perp)*0.11,s*0.012+uTime*0.5))*0.6+vnoise(vec2(dot(p,perp)*0.37,s*0.03+uTime*0.9))*0.4;
    float face=smoothstep(0.08,0.40,length(gb));
    float crest=exp(-sq((s+150.0)/90.0));
    tfoam=face*(0.12+0.88*smoothstep(0.38,0.66,strk+0.25*crest))+crest*0.7*smoothstep(0.3,0.6,turb2)
      +smoothstep(-1300.0,-80.0,s)*smoothstep(90.0,-30.0,s)*smoothstep(0.42,0.62,turb*0.7+turb2*0.3)*0.9;
    tfoam=clamp(tfoam,0.0,1.0)*smoothstep(0.0,4.0,uTsuH);
    g+=gb+(vec2(turb,turb2)-0.5)*0.5*tfoam;
  }
  vec3 N=normalize(vec3(-g.x,1.0,-g.y));
  vec3 R=reflect(-V,N); R.y=abs(R.y)+0.015; R=normalize(R);
  vec3 refl=skyAll(R,0);
  float F=0.02+0.80*pow(clamp(1.0-dot(N,V),0.0,1.0),5.0);
  vec3 shallow=vec3(0.03,0.60,0.58), deep=vec3(0.01,0.20,0.36);
  vec3 murk=vec3(0.16,0.13,0.10);
  vec3 scat=mix(mix(shallow,deep,1.0-exp(-depth*0.22)),murk,max(uAsh*0.8,smoothstep(0.0,6.0,uTsuH)))*uWaterLight;
  float L=depth/max(V.y,0.14);
  float ab=1.0-exp(-L*(0.50+1.2*uAsh));
  float a=F+(1.0-F)*ab;
  vec3 c=(refl*F+scat*(1.0-F)*ab)/max(a,1e-3);
  vec3 foamCol=vec3(1.0,0.98,0.95)*(uWaterLight*1.25+0.015);
  float foam=smoothstep(0.14,0.0,depth)*(0.45+0.55*vnoise(p*3.0+uTime*0.5));
  c=mix(c,foamCol,foam*0.85);
  a=max(a,foam*0.75);
  if(uRain>0.0){
    float cs=clamp(uBead*25.0,0.10,1.2);
    float sp=(rings(p/cs)+rings(p/(cs*1.73)+11.3))*uRain*min(1.0,f2*5.0);
    c+=foamCol*sp*0.6; a=max(a,min(sp,1.0)*0.7);
    // au plus fort de l'averse, chaque cm² est frappé plus d'une fois par seconde : la surface n'est plus qu'une écume
    float fr=uRain*uFroth;
    float fl=vnoise(p*23.0+floor(uTime*24.0)*3.7)*0.5+vnoise(p*61.0+floor(uTime*31.0)*5.1)*0.5;
    float kf=fr*(0.30+0.55*fl)*min(1.0,f2*8.0+0.3);
    c=mix(c,foamCol*0.85,kf); a=max(a,kf);
  }
  a*=smoothstep(0.0,0.035,depth);
  c=mix(c,foamCol*0.9,tfoam*0.92); a=max(a,tfoam);
  float fg=1.0-exp(-sq(dist*uFogDen));
  c=mix(c,uFogCol,fg); a=mix(a,1.0,fg);
  gl_FragColor=vec4(c,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const TERRAIN_FRAG = /* glsl */`
${COMMON}
varying vec3 vW; varying vec3 vN;
void main(){
  vec2 p=vW.xz;
  float dist=length(cameraPosition-vW);
  vec3 N=normalize(vN);
  float rf=1.0/(1.0+dist*0.03);
  vec2 rd=vec2(0.94,0.34);
  float ph=dot(p,rd)*14.0+3.0*vnoise(p*0.5);
  N=normalize(N+vec3(rd.x,0.0,rd.y)*cos(ph)*0.035*rf);
  float hrel=vW.y-waterY(p);
  float wet=smoothstep(0.30,-0.03,hrel);
  vec3 dry=vec3(0.82,0.64,0.42), wetc=vec3(0.50,0.39,0.27);
  vec3 alb=mix(dry,wetc,wet)*(0.88+0.24*vnoise(p*0.6))*(0.93+0.14*vnoise(p*11.0));
  alb=mix(alb,alb*vec3(0.80,0.86,0.78),smoothstep(0.9,1.6,vW.y)*vnoise(p*0.2+4.0)*0.6);
  vec3 light=uSunCol*uSunVis*max(dot(N,uSunDir),0.0)+uAmb+uFireCol*uFire*max(dot(N,uFireDir),0.0);
  float depth=-hrel;
  if(depth>0.0){
    vec2 q=p*0.85;
    float tt=uTime*0.9;
    q+=vec2(sin(q.y*1.3+tt),cos(q.x*1.1-tt*0.8))*0.55;
    q+=vec2(sin(q.y*2.1-tt*0.7),cos(q.x*2.3+tt))*0.30;
    float ca=pow(clamp(0.5+0.5*sin(q.x*1.7+q.y*1.3),0.0,1.0),5.0);
    light*=exp(-depth*0.07);
    light+=(uSunCol*uSunVis+uFireCol*uFire)*ca*0.55*smoothstep(0.0,0.35,depth)*exp(-depth*0.22)*rf*3.0*min(1.0,1.0/(rf*3.0));
  }
  float beadGl=0.0;
  if(uAsh>0.0){
    // tapis d'éjectas : grains visibles de près, teinte moyenne de loin
    float cell=max(uBead*1.5,0.006);
    vec2 gq=p/cell; vec2 id=floor(gq); vec2 f=fract(gq)-0.5;
    float hs=hash21(id);
    vec2 off=(vec2(hash21(id+3.1),hash21(id+7.7))-0.5)*0.45;
    float r=length(f-off);
    float bead=smoothstep(0.40,0.28,r)*step(0.18,hs);
    float nearF=smoothstep(cell*1100.0,cell*260.0,dist);
    vec3 glass=mix(vec3(0.030,0.036,0.026),vec3(0.17,0.12,0.06),hs*hs);
    float an=vnoise(p*1.7)*0.6+vnoise(p*13.0)*0.4;
    vec3 far=vec3(0.085,0.078,0.070)*(0.6+0.8*an);
    vec3 nearC=mix(vec3(0.045,0.042,0.038),glass*1.3,bead);
    vec3 carpet=mix(far,nearC,nearF);
    float glint=bead*nearF*smoothstep(0.16,0.02,length(f-off-vec2(0.10,-0.10)));
    if(uBead>0.02){
      // gros fragments : un champ de blocaille, pas des billes
      vec2 rp=p/uBead;
      float rb=vnoise(rp*0.55)*0.55+vnoise(rp*1.7+4.0)*0.30+vnoise(rp*5.0)*0.15;
      float edge=smoothstep(0.42,0.50,rb)-smoothstep(0.50,0.58,rb);
      carpet=vec3(0.075,0.066,0.058)*(0.35+1.3*rb)-0.03*edge;
      glint=0.0;
    }
    float cov=uAsh*smoothstep(0.0,0.45,an+uAsh*1.4-0.35);
    alb=mix(alb,max(carpet,vec3(0.0)),cov);
    beadGl=glint*cov;
  }
  vec3 lit=alb*light+beadGl*(uSunCol*uSunVis*0.25+uAmb*0.35);
  if(uRain*uFroth>0.0&&depth<=0.0){
    vec2 hq=p/0.014; vec2 hid=floor(hq);
    float hop=step(0.82,hash21(hid+floor(uTime*22.0)*1.37))*smoothstep(0.34,0.18,length(fract(hq)-0.5));
    lit+=light*0.28*hop*uRain*uFroth*smoothstep(6.0,1.0,dist);
  }
  if(uAsh>0.0&&depth<=0.0){
    vec2 hp=p/max(uBead,0.02);
    float em=smoothstep(0.66,0.80,vnoise(hp*0.45+3.0)*0.7+vnoise(hp*1.9)*0.3)*(0.7+0.3*sin(uTime*1.3+p.x*0.7));
    lit+=vec3(1.0,0.36,0.06)*em*uHot*1.6*uAsh;
  }
  if(uMelt>0.0){
    float ln=fbm(p*0.035+uTime*0.01,5);
    float cr=fbm(p*0.4,3);
    vec3 lava=vec3(1.0,0.34,0.05)*(0.25+5.0*ln*ln*ln)*uMelt*(1.0+uInnerEm)+vec3(0.05,0.03,0.025)*cr;
    lit=mix(lit,lava,step(0.001,uMelt));
  }
  vec3 c=applyFog(lit,dist);
  gl_FragColor=vec4(c,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const HAIL_VERT = /* glsl */`
${COMMON}
attribute float end;
uniform vec3 uBox; uniform vec3 uOff; uniform float uLen; uniform float uDens; uniform vec2 uSl;
varying float vA;
void main(){
  vec3 s=position;
  float h=fract(s.x*91.7+s.z*47.3+s.y*13.1);
  vA=0.0;
  if(h>uDens){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  float sp=0.75+0.55*fract(h*57.3);
  vec3 p=s*uBox+vec3(uOff.x,-uOff.y*sp,uOff.z);
  p=cameraPosition+mod(p-cameraPosition+uBox*0.5,uBox)-uBox*0.5;
  float g=max(terrainH(p.xz),waterY(p.xz));
  if(p.y<g){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  p.y+=end*uLen*sp; p.xz+=end*uSl*uLen*sp;
  vA=(1.0-0.7*end)*smoothstep(uBox.x*0.5,uBox.x*0.28,distance(p.xz,cameraPosition.xz));
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
}
`;
export const HAIL_FRAG = /* glsl */`
uniform vec3 uCol; uniform float uA;
varying float vA;
void main(){
  gl_FragColor=vec4(uCol,uA*vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export const PART_VERT = /* glsl */`
attribute float size; attribute vec4 pcolor;
varying vec4 vC;
uniform float uScale;
void main(){ vC=pcolor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=size*uScale/max(-mv.z,0.1); }
`;
export const PART_FRAG = /* glsl */`
varying vec4 vC;
uniform vec3 uLight;
void main(){
  vec2 u=gl_PointCoord-0.5; float r=dot(u,u)*4.0;
  if(r>1.0) discard;
  float a=(1.0-r); a=a*a*a;
  gl_FragColor=vec4(vC.rgb*uLight,vC.a*a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
