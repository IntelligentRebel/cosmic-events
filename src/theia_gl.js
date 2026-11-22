// Shaders de la scène Theia. Unités : km dans l'espace, m au sol.
export const NMF = 16;

export const NOISE = /* glsl */`
float sq(float x){ return x*x; }
float hash31(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vn3(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn3(p); p=p*2.03+vec3(7.1,3.3,5.7); a*=0.5; } return s; }
float fbm7(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<7;i++){ s+=a*vn3(p); p=p*2.03+vec3(7.1,3.3,5.7); a*=0.5; } return s; }
// cratères : une cuvette sombre et un rebord clair par cellule
float craters(vec3 p, float dens){
  vec3 id=floor(p), f=fract(p); float h=0.0;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 o=vec3(float(x),float(y),float(z));
    float rn=hash31(id+o+17.0);
    if(rn>dens) continue;
    vec3 c=o+vec3(hash31(id+o),hash31(id+o+5.1),hash31(id+o+9.7));
    float r=0.16+0.30*hash31(id+o+3.3), d=length(f-c)/r;
    h+=smoothstep(1.0,0.8,d)*(-0.55)+exp(-sq((d-1.0)/0.13))*0.55;
  }
  return h;
}
`;
const VERT = /* glsl */`
varying vec3 vO; varying vec3 vW; varying vec3 vNw;
void main(){ vO=position; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vNw=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }
`;
const OUT = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------------------------------------------------------------- Theia
export const THEIA = { vertexShader: VERT, fragmentShader: /* glsl */`
${NOISE}
uniform vec3 uSun, uSeed, uColA, uColB, uColC, uEarthDir;
uniform float uMars, uCap, uCrat, uSea, uMelt, uEarthShine;
uniform vec3 uMF[${NMF}];
varying vec3 vO; varying vec3 vW; varying vec3 vNw;
float km(vec3 n, vec3 c){ return 3390.0*acos(clamp(dot(n,c),-1.0,1.0)); }
float blob(vec3 n, vec3 c, float r){ return smoothstep(r,r*0.55,km(n,c)+ (fbm3(n*9.0)-0.5)*r*0.7); }
void main(){
  vec3 n=normalize(vO);
  vec3 alb; float bump=0.0;
  if(uMars<0.5){
    vec3 p=n*2.0+uSeed;
    float h=fbm7(p), h2=fbm7(p*3.1+4.0);
    float land=smoothstep(0.42,0.60,h);
    alb=mix(uColB,uColA,land)*(0.75+0.5*h2);
    alb=mix(alb,uColC,smoothstep(0.62,0.80,fbm3(p*1.3+9.0))*uSea);
    float cr=craters(n*5.0+uSeed,0.5)+0.6*craters(n*13.0+uSeed,0.6)+0.35*craters(n*34.0+uSeed,0.6);
    alb*=1.0+0.42*cr*uCrat; bump=cr*uCrat;
    float cap=smoothstep(uCap,uCap+0.05,abs(n.z)+(h2-0.5)*0.12);
    alb=mix(alb,vec3(0.92,0.94,0.97),cap);
  } else {
    // Mars approximatif : grands reliefs posés à la main, pas une carte
    float f=fbm7(n*3.0+2.0), f2=fbm7(n*11.0);
    alb=mix(vec3(0.62,0.33,0.17),vec3(0.80,0.50,0.28),f)*(0.85+0.3*f2);
    float dark=0.0;
    dark=max(dark,blob(n,uMF[0],700.0));    // Syrtis Major
    dark=max(dark,blob(n,uMF[1],1000.0));   // Acidalia
    dark=max(dark,blob(n,uMF[2],450.0));    // Meridiani
    dark=max(dark,blob(n,uMF[3],900.0));    // Erythraeum
    dark=max(dark,blob(n,uMF[4],1100.0));   // Cimmerium
    dark=max(dark,blob(n,uMF[5],1000.0));   // Sirenum
    dark=max(dark,blob(n,uMF[6],800.0));    // Tyrrhenum
    dark=max(dark,0.55*smoothstep(0.62,0.80,n.z+(f-0.5)*0.25)); // plaines du nord
    dark=max(dark,0.75*smoothstep(0.52,0.66,fbm3(n*2.6+31.0))*smoothstep(0.25,-0.05,n.z)*smoothstep(-0.92,-0.6,n.z)); // marbrures sombres de l'hémisphère sud
    alb=mix(alb,vec3(0.26,0.17,0.13)*(0.8+0.4*f2),dark*0.85);
    alb=mix(alb,vec3(0.86,0.62,0.40),blob(n,uMF[7],1150.0)*0.8);   // Hellas
    alb=mix(alb,vec3(0.84,0.60,0.40),blob(n,uMF[8],520.0)*0.7);    // Argyre
    alb=mix(alb,vec3(0.78,0.47,0.27),smoothstep(2300.0,900.0,km(n,uMF[9]))*0.5); // Tharsis
    for(int i=10;i<14;i++){                                         // Olympus Mons et les trois Tharsis Montes
      float d=km(n,uMF[i]); float R=i==10?300.0:200.0;
      alb=mix(alb,vec3(0.72,0.45,0.28),smoothstep(R,R*0.6,d)*0.8);
      alb*=1.0-0.55*exp(-sq((d-R)/(R*0.12)))-0.5*smoothstep(R*0.16,R*0.08,d);
      bump+=smoothstep(R,0.0,d)*1.5;
    }
    // Valles Marineris : distance à un arc de grand cercle
    vec3 a=uMF[14], b=uMF[15]; vec3 gn=normalize(cross(a,b));
    float dl=abs(asin(clamp(dot(n,gn),-1.0,1.0)))*3390.0;
    float tt=dot(n-a,b-a)/dot(b-a,b-a);
    float vm=smoothstep(110.0,30.0,dl+(f2-0.5)*120.0)*smoothstep(-0.08,0.02,tt)*smoothstep(1.08,0.98,tt);
    alb*=1.0-0.62*vm;
    float cr=0.5*craters(n*14.0+3.0,0.45)*smoothstep(0.2,-0.3,n.z)+0.3*craters(n*36.0,0.5);
    alb*=1.0+0.25*cr; bump+=cr;
    float cap=max(smoothstep(0.984,0.992,n.z+(f2-0.5)*0.015),smoothstep(0.990,0.996,-n.z+(f2-0.5)*0.01));
    alb=mix(alb,vec3(0.95,0.95,0.97),cap);
  }
  vec3 N=normalize(vNw+0.10*bump*normalize(vNw-uSun*dot(vNw,uSun)+1e-4));
  float l=max(dot(N,uSun),0.0);
  float es=max(dot(normalize(vNw),uEarthDir),0.0)*uEarthShine;
  vec3 col=alb*(l*1.75*vec3(1.0,0.96,0.90)+es*vec3(0.9,0.7,0.5)+0.012);
  if(uMars>0.5){ float rim=clamp(1.0-dot(normalize(vNw),normalize(cameraPosition-vW)),0.0,1.0); col+=vec3(0.75,0.5,0.35)*rim*rim*rim*0.25*l; }
  // la face qui touche la Terre fond la première
  float front=dot(normalize(vNw),uEarthDir);
  float m=clamp(uMelt*1.6+front*0.9-0.6,0.0,1.0)*step(0.001,uMelt);
  float fl=fbm3(n*6.0+uMelt*2.0);
  col=mix(col,mix(vec3(1.0,0.30,0.05),vec3(1.0,0.9,0.6),fl)*(2.0+6.0*uMelt),m);
  gl_FragColor=vec4(col,1.0);
  ${OUT}
}` };

// ---------------------------------------------------------------- Terre : proto-Terre, océan de magma, croûte, océans, aujourd'hui
// la Terre se déforme vers la Lune : bourrelet de marée (3cos² − 1)/2, amplitude fournie déjà exagérée
const EARTH_VERT = /* glsl */`
uniform vec3 uTideDir; uniform float uTideAmp;
varying vec3 vO; varying vec3 vW; varying vec3 vNw;
void main(){
  vO=position; vec4 w=modelMatrix*vec4(position,1.0);
  vec3 nr=normalize(w.xyz); float c=dot(nr,uTideDir);
  w.xyz+=nr*length(w.xyz)*uTideAmp*(1.5*c*c-0.5);
  vW=w.xyz; vNw=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w;
}
`;
export const EARTH = { vertexShader: EARTH_VERT, fragmentShader: /* glsl */`
${NOISE}
uniform vec3 uSun, uC;
uniform float uShock, uHeat, uRaft, uCool, uWater, uLife, uFlow, uVapor;
varying vec3 vO; varying vec3 vW; varying vec3 vNw;
void main(){
  vec3 n=normalize(vO); vec3 Nw=normalize(vNw); vec3 V=normalize(cameraPosition-vW);
  float f1=fbm3(n*3.0+7.0), rid=1.0-abs(2.0*fbm3(n*9.0)-1.0);
  // proto-Terre : croûte de basalte sombre, fissures, vapeur
  vec3 alb=mix(vec3(0.075,0.068,0.064),vec3(0.21,0.165,0.12),smoothstep(0.35,0.70,f1));
  float pm=fbm3(n*1.6+21.0);
  alb=mix(alb,vec3(0.30,0.20,0.13),smoothstep(0.50,0.65,pm)*0.6);
  vec3 em=vec3(1.0,0.33,0.05)*smoothstep(0.955,0.995,rid)*0.75*smoothstep(0.35,0.6,fbm3(n*2.5+4.0));
  float st=smoothstep(0.52,0.74,fbm3(n*5.0+vec3(0.0,0.0,uFlow*0.3)));
  alb=mix(alb,vec3(0.72,0.70,0.68),st*0.55); em*=1.0-st*0.6;
  // front de fusion parti du point d'impact
  float ang=acos(clamp(dot(n,uC),-1.0,1.0));
  float molt=uShock>0.0?smoothstep(uShock,uShock-0.07,ang+(f1-0.5)*0.10):0.0;
  vec3 q=n*4.0+vec3(fbm3(n*3.0+uFlow));
  float fl=fbm3(q*1.6);
  vec3 magma=mix(vec3(1.0,0.22,0.03),vec3(1.0,0.80,0.45),smoothstep(0.34,0.74,fl))*uHeat*0.85;
  magma*=1.0+3.0*exp(-sq((ang-uShock)/0.05))*step(uShock,3.2);
  float raft=smoothstep(1.0-uRaft,1.12-uRaft,fbm3(n*7.0+3.0)*0.62+rid*0.5);
  vec3 rock=mix(vec3(0.045,0.04,0.038),vec3(0.17,0.14,0.115),smoothstep(0.3,0.75,f1))*(0.7+0.6*fbm3(n*20.0));
  // ère de l'eau, puis de la vie
  float hgt=fbm3(n*2.2+11.0)+0.45*fbm3(n*6.5+2.0);
  float land=smoothstep(0.0,0.03,hgt-mix(-1.0,0.80,uWater));
  float shelf=smoothstep(-0.14,0.0,hgt-0.80);
  vec3 sea=mix(vec3(0.008,0.04,0.14),vec3(0.03,0.26,0.32),shelf*0.7);
  vec3 landc=mix(rock*1.6,mix(vec3(0.09,0.21,0.07),vec3(0.42,0.35,0.21),smoothstep(0.35,0.70,fbm3(n*13.0))),uLife);
  landc=mix(landc,vec3(0.93),uLife*smoothstep(0.90,0.95,abs(n.z)+(f1-0.5)*0.1));
  vec3 late=mix(sea,landc,land);
  float cl=smoothstep(0.50,0.72,fbm3(n*5.0+fbm3(n*8.5)*1.3+vec3(0.0,0.0,uFlow)))*uWater;
  float ndl=dot(Nw,uSun), day=smoothstep(-0.10,0.25,ndl);
  vec3 sunc=mix(vec3(1.0,0.50,0.26),vec3(1.0,0.97,0.92),smoothstep(0.0,0.35,ndl))*1.9;
  vec3 solid=mix(rock,late,smoothstep(0.0,0.05,uWater));
  vec3 a2=mix(alb,mix(vec3(0.035,0.025,0.022),solid,uCool),molt);
  vec3 col=a2*sunc*day;
  col+=sunc*pow(max(dot(reflect(-uSun,Nw),V),0.0),90.0)*(1.0-land)*(1.0-cl)*0.5*day*uWater;
  col=mix(col,vec3(0.92)*sunc*day*0.42,cl*0.92);
  col+=em*(1.0-molt);
  col+=magma*(1.0-raft)*molt*(1.0-uCool)+magma*0.08*raft*molt*(1.0-uCool);
  col+=vec3(1.0,0.4,0.08)*smoothstep(0.93,0.99,rid)*0.5*uCool*(1.0-uWater)*molt;
  float rim=clamp(1.0-dot(Nw,V),0.0,1.0); rim=rim*rim*rim;
  col+=mix(vec3(0.75,0.55,0.40)*0.35,vec3(0.22,0.42,0.95)*0.8,uWater)*rim*day*(1.0-uVapor);
  col+=vec3(1.0,0.45,0.12)*rim*uVapor*1.6;
  gl_FragColor=vec4(col,1.0);
  ${OUT}
}` };

// halo de vapeur de roche, puis atmosphère
export const HALO = { vertexShader: EARTH_VERT, fragmentShader: /* glsl */`
uniform vec3 uSun; uniform float uVapor, uWater;
varying vec3 vO; varying vec3 vW; varying vec3 vNw;
void main(){
  vec3 n=normalize(vNw); float rim=clamp(1.0-dot(n,normalize(cameraPosition-vW)),1e-4,1.0);
  float a=pow(rim,2.6)*smoothstep(1.0,0.78,rim);
  vec3 c=vec3(1.0,0.42,0.10)*uVapor*2.2+vec3(0.25,0.5,1.0)*1.5*uWater*smoothstep(-0.25,0.2,dot(n,uSun));
  gl_FragColor=vec4(c*a,1.0);
  ${OUT}
}` };

// ---------------------------------------------------------------- Lune
export const MOON = { vertexShader: VERT, fragmentShader: /* glsl */`
${NOISE}
uniform vec3 uSun, uEarthDir; uniform float uHot, uMaria, uEarthShine, uMariaHot, uFlow;
varying vec3 vO; varying vec3 vW; varying vec3 vNw;
void main(){
  vec3 n=normalize(vO);
  float f=fbm7(n*2.4+5.0);
  vec3 alb=vec3(0.36,0.35,0.34)*(0.8+0.4*fbm3(n*9.0));
  float fm=fbm7(n*2.0+vec3(13.0,2.0,7.0));
  float marMask=smoothstep(0.0,0.05,fm-mix(0.80,0.512,smoothstep(-0.25,0.85,n.x))-0.06*abs(n.z));   // environ un tiers de la face visible, presque rien de l'autre côté
  float mar=marMask*uMaria;
  alb=mix(alb,vec3(0.11,0.11,0.12),mar);
  float cr=craters(n*4.0,0.5)+0.6*craters(n*11.0,0.6)+0.35*craters(n*30.0,0.6);
  alb*=1.0+0.40*cr*(1.0-uHot)*(1.0-0.6*mar);
  vec3 N=normalize(vNw+0.10*cr*(1.0-uHot)*normalize(vNw-uSun*dot(vNw,uSun)+1e-4));
  vec3 col=alb*(max(dot(N,uSun),0.0)*1.9+max(dot(normalize(vNw),uEarthDir),0.0)*uEarthShine+0.01);
  float fl=fbm3(n*5.0+uHot+vec3(0.0,0.0,uFlow));
  vec3 hot=mix(vec3(1.0,0.26,0.035),vec3(1.0,0.80,0.45),smoothstep(0.3,0.7,fl))*(0.32+0.62*uHot)*(0.55+0.6*smoothstep(0.35,0.62,fbm3(n*11.0+vec3(0.0,uFlow,0.0))));
  float crust=smoothstep(uHot*1.3,uHot*1.3+0.15,fbm3(n*8.0+2.0));
  col=mix(col,hot,(1.0-crust)*step(0.001,uHot));
  // épanchements de lave dans les bassins : les futures mers
  if(uMariaHot>0.0){
    float er=fbm3(n*9.0+vec3(uFlow*0.6,0.0,3.0));
    float act=marMask*smoothstep(1.02-0.42*uMariaHot,1.10-0.42*uMariaHot,er+0.25);
    col=mix(col,mix(vec3(1.0,0.24,0.03),vec3(1.0,0.75,0.4),smoothstep(0.45,0.75,er))*1.3,act);
  }
  gl_FragColor=vec4(col,1.0);
  ${OUT}
}` };

// ---------------------------------------------------------------- disque de débris
export const DISK = { vertexShader: VERT, fragmentShader: /* glsl */`
${NOISE}
uniform float uDisk, uPhase, uRin, uRout, uGap;
varying vec3 vO; varying vec3 vW; varying vec3 vNw;
void main(){
  float r=length(vO.xy); float u=(r-uRin)/(uRout-uRin);
  float th=atan(vO.y,vO.x+1e-6);
  float om=pow(uRin/r,1.5);
  vec2 sp=vec2(cos(th-uPhase*om),sin(th-uPhase*om));
  float n=fbm3(vec3(sp*3.0,r*0.0006))*0.6+fbm3(vec3(sp*9.0,r*0.002))*0.4;
  float prof=smoothstep(0.0,0.06,u)*smoothstep(1.0,0.45,u);
  float gap=1.0-uGap*exp(-sq((r-24000.0)/2600.0));
  float a=uDisk*prof*(0.35+0.9*n)*gap;
  vec3 c=mix(vec3(1.0,0.70,0.36)*1.1,vec3(1.0,0.22,0.03)*0.5,smoothstep(0.0,0.8,u))*(0.35+2.2*n*n);
  gl_FragColor=vec4(c,clamp(a*0.85,0.0,0.85));
  ${OUT}
}` };

// ---------------------------------------------------------------- débris : chaque point suit son orbite de Kepler
export const DEBRIS = { vertexShader: /* glsl */`
attribute vec4 el;   // a, e, M0, n
attribute vec3 P; attribute vec3 Q;
attribute vec4 tt;   // t0, tau de retombée, hasard, type (0 lié, 1 échappé)
uniform float uTau, uCirc, uPx, uMoonM, uInfall, uRoche, uRmin, uCool;
varying vec4 vC;
void main(){
  float dt=uTau-tt.x;
  if(dt<0.0||uTau>tt.y){ gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; return; }
  vec3 pw; float al=1.0;
  if(tt.w>0.5){ pw=P+Q*dt; al=smoothstep(900000.0,200000.0,length(pw)); }
  else {
    float e=el.y*(1.0-uCirc), a=mix(el.x,max(el.x*(1.0-el.y*el.y),uRmin),uCirc);
    float nn=el.w*pow(el.x/a,1.5);
    float M=el.z+nn*dt, E=M;
    for(int i=0;i<6;i++) E-=(E-e*sin(E)-M)/(1.0-e*cos(E));
    pw=a*(cos(E)-e)*P+a*sqrt(max(1.0-e*e,0.0))*sin(E)*Q;
    pw.z*=1.0-0.94*uCirc;
    if(a>uRoche) al*=1.0-smoothstep(tt.z*0.9,tt.z*0.9+0.1,uMoonM);
    else al*=1.0-smoothstep(tt.z*0.9,tt.z*0.9+0.1,uInfall);
  }
  vec4 mv=viewMatrix*vec4(pw,1.0); gl_Position=projectionMatrix*mv;
  float age=clamp(dt/20000.0,0.0,1.0);
  vec3 c=mix(vec3(1.1,0.8,0.42),vec3(0.9,0.25,0.04),age)*(0.5+0.5*tt.z);
  vC=vec4(c*(1.0-0.5*uCool),al);
  gl_PointSize=clamp(uPx*90.0/max(-mv.z,1.0),1.3,4.5)*step(0.004,al);
}`, fragmentShader: `varying vec4 vC; void main(){ vec2 u=gl_PointCoord-0.5; if(dot(u,u)>0.25) discard; gl_FragColor=vec4(vC.rgb*vC.a,1.0);
  ${OUT}
}` };

// ---------------------------------------------------------------- au sol : ciel et terrain
export const DOME = { vertexShader: `varying vec3 vD; void main(){ vD=position; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_Position.z=gl_Position.w*0.9999; }`,
fragmentShader: /* glsl */`
${NOISE}
uniform vec3 uSunL, uZen, uHor, uGlowDir, uHazeCol, uFog;
uniform float uDay, uAlpha, uGlow, uHaze, uTime;
varying vec3 vD;
void main(){
  vec3 d=normalize(vD); float y=max(d.y,0.0);
  float hz=pow(1.0-y,3.0);
  vec3 c=mix(uZen,uHor,hz)*uDay;
  float sd=max(dot(d,uSunL),0.0);
  c+=vec3(1.0,0.8,0.6)*(pow(sd,8.0)*0.25+pow(sd,200.0)*1.5)*uDay;
  float a=clamp(uAlpha*(0.10+0.75*hz),0.0,1.0);
  // lueur de l'impact à l'horizon
  float gd=max(dot(normalize(vec3(d.x,0.0,d.z)+1e-5),uGlowDir),0.0);
  float g=uGlow*pow(gd,3.0)*exp(-y*3.0);
  c+=vec3(1.0,0.62,0.30)*g; a=clamp(a+g*0.15,0.0,1.0);
  // vapeur de roche incandescente
  float hn=fbm3(vec3(d.xz/(y+0.25)*1.3,uTime*0.02));
  c=mix(c,uHazeCol*(0.55+0.9*hn),uHaze); a=mix(a,clamp(0.45+0.55*hz,0.0,1.0),uHaze);
  if(d.y<0.0){ c=uFog; a=1.0; }
  gl_FragColor=vec4(c,a);
  ${OUT}
}` };

export const GROUND = { vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
fragmentShader: /* glsl */`
${NOISE}
uniform vec3 uSunL, uSunCol, uAmb, uFog, uFire;
uniform float uMolten, uHeat, uWater, uCrack, uTime, uFogDen, uShore;
varying vec3 vW;
void main(){
  vec2 p=vW.xz; float dist=length(cameraPosition-vW);
  float lod=1.0/(1.0+dist*0.004);
  float big=fbm3(vec3(p*0.004,1.0)), mid=fbm3(vec3(p*0.05,2.0)), fine=fbm3(vec3(p*0.9,3.0));
  // basalte en dalles, fissures rougeoyantes
  float rid=1.0-abs(2.0*fbm3(vec3(p*0.012,5.0))-1.0);
  float e=0.6; float hC=mid*1.2+fine*0.25*lod;
  float hX=fbm3(vec3((p+vec2(e,0.0))*0.05,2.0))*1.2+fbm3(vec3((p+vec2(e,0.0))*0.9,3.0))*0.25*lod;
  float hZ=fbm3(vec3((p+vec2(0.0,e))*0.05,2.0))*1.2+fbm3(vec3((p+vec2(0.0,e))*0.9,3.0))*0.25*lod;
  vec3 N=normalize(vec3((hC-hX)*2.2,1.0,(hC-hZ)*2.2));
  vec3 alb=mix(vec3(0.035,0.032,0.030),vec3(0.115,0.095,0.075),big)*(0.6+0.8*fine)*(0.7+0.6*mid);
  vec3 light=uSunCol*max(dot(N,uSunL),0.0)+uAmb+uFire*max(N.y,0.0);
  vec3 col=alb*light;
  float fis=smoothstep(0.90,0.975,rid)*smoothstep(0.30,0.55,fbm3(vec3(p*0.0015,9.0)));
  col+=vec3(1.0,0.34,0.05)*fis*(0.7+0.3*sin(uTime*0.7+p.x*0.05))*uCrack*2.2;
  // océan de magma : nappes brillantes, radeaux de croûte
  if(uMolten>0.0){
    vec2 q=p*0.006+vec2(uTime*0.004,uTime*0.002);
    float fl=fbm3(vec3(q+fbm3(vec3(q*1.7,uTime*0.01)),4.0));
    vec3 mg=mix(vec3(1.0,0.25,0.03),vec3(1.0,0.85,0.5),smoothstep(0.30,0.70,fl))*uHeat;
    float raft=smoothstep(0.50,0.62,fbm3(vec3(p*0.02,7.0))*0.7+rid*0.4-(1.0-uMolten)*0.0+0.25*(1.0-uHeat*0.4));
    vec3 crust=vec3(0.03,0.022,0.02)*light+mg*0.06;
    col=mix(col,mix(mg,crust,raft*0.85),uMolten);
  }
  // mer
  if(uWater>0.0){
    float shore=smoothstep(-0.02,0.04,big-uShore);
    vec3 V=normalize(cameraPosition-vW);
    vec3 Nw=normalize(vec3((fbm3(vec3(p*0.4+uTime*0.3,1.0))-0.5)*0.25*lod,1.0,(fbm3(vec3(p*0.4-uTime*0.25,2.0))-0.5)*0.25*lod));
    float F=0.03+0.9*pow(clamp(1.0-dot(Nw,V),0.0,1.0),5.0);
    vec3 wc=mix(vec3(0.02,0.16,0.24)*(uSunCol*0.35+uAmb),uFog,F);
    wc+=uSunCol*pow(max(dot(reflect(-uSunL,Nw),V),0.0),200.0)*0.6;
    col=mix(col,wc,uWater*(1.0-shore));
  }
  float fg=1.0-exp(-sq(dist*uFogDen));
  col=mix(col,uFog,fg);
  gl_FragColor=vec4(col,1.0);
  ${OUT}
}` };
