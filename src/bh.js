// Trou noir de Schwarzschild par lancer de rayons courbes. Unité de longueur : le rayon de Schwarzschild (rs = 1),
// trou noir à l'origine, disque dans le plan y = 0. La forme des rayons est exacte (u'' + u = 3/2 u²) ;
// l'observateur est soit immobile, soit en chute libre depuis l'infini (uFall), y compris sous l'horizon.
import { THREE, NOISE, STARS_GLSL, makeBackdrop, BACKDROP_VERT } from './kit.js';

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uCam; uniform mat3 uBasis; uniform float uTan,uAspect,uTime,uFall;
uniform float uDiskIn,uDiskOut,uDiskB,uDiskFall,uDiskSpin,uDiskHot,uDiskCool;
uniform vec3 uStar,uStarCol; uniform float uStarR,uStarGlow;
uniform float uJet,uJetLen,uGlow,uGlowS,uMW,uStarsB,uStream,uStreamR;
uniform vec3 uMWAxis;
${NOISE}
${STARS_GLSL}
vec4 planeCol(vec3 p,vec3 v){
  float r=length(p.xz);vec4 o=vec4(0.);
  if(uDiskB>0.&&r>uDiskIn*.98&&r<uDiskOut){
    float x=r/uDiskIn,lr=log(r),ph=atan(p.z,p.x);
    float om=uDiskSpin*sqrt(.5/(r*r*r));
    float n=0.;
    for(int i=0;i<2;i++){float f=fract(uTime*.04+float(i)*.5);float a=ph-om*(f-.5)*90.;float w=1.-abs(2.*f-1.);
      n+=w*(fbm3(vec3(cos(a)*1.6,sin(a)*1.6,lr*9.))*.65+fbm3(vec3(cos(a)*5.,sin(a)*5.,lr*22.+3.))*.35);}
    float edge=smoothstep(uDiskIn*.98,uDiskIn*1.25,r)*smoothstep(uDiskOut,uDiskOut*.7,r);
    float dens=edge*smoothstep(.18,.75,n*1.25);
    float k=1.-clamp(log(x)/log(uDiskOut/uDiskIn),0.,1.);k*=k;
    float T=mix(uDiskCool,uDiskHot,k);
    float be=min(sqrt(.5/r),.62);vec3 tg=uDiskSpin*normalize(vec3(-p.z,0.,p.x));
    float dop=sqrt(1.-be*be)/(1.-be*dot(tg,-normalize(v)));
    float gr=sqrt(max(1.-1./r,.03));
    float I=uDiskB*pow(x,-uDiskFall)*(.35+1.3*n)*pow(dop*gr,3.2);
    o=vec4(pow(blackbody(T*dop*gr),vec3(1.7))*I*dens,clamp(dens*1.15,0.,.97));
  }
  if(uStream>0.&&uStarR>0.&&r>=uDiskOut*.9){
    float ds=length(uStar.xz);float ps=atan(uStar.z,uStar.x);float d=atan(p.z,p.x)-ps;d=mod(d+3.14159,6.28318)-3.14159;
    d*=uDiskSpin;float L1=ds-uStarR*1.02;
    if(d>-.05&&d<1.5){float q=clamp(d/1.4,0.,1.);float rs=mix(L1,uStreamR,pow(q,.75));
      float w=mix(.10,.035,q)*ds;float e=exp(-pow((r-rs)/w,2.))*smoothstep(1.5,1.2,d)*smoothstep(-.05,.05,d);
      float tex=.6+.6*fbm3(vec3(r/ds*14.,d*9.-uTime*.03,1.));
      o+=vec4(mix(uStarCol,vec3(1.,.75,.5),q)*uStream*e*tex*(.6+2.*q),e*.5);}
    float hot=exp(-pow(length(p.xz-uStreamR*vec2(cos(ps+1.4*uDiskSpin),sin(ps+1.4*uDiskSpin)))/(.08*ds),2.));
    o.rgb+=vec3(1.,.8,.6)*hot*uStream*3.;
  }
  return o;
}
void comp(inout vec3 col,inout float tr,vec4 c){col+=tr*c.rgb;tr*=1.-c.a;}
void straight(vec3 p,vec3 v,float tmax,inout vec3 col,inout float tr){
  float tp=abs(v.y)>1e-9?-p.y/v.y:-1.;bool hp=tp>0.&&tp<tmax;
  float ts=-1.;
  if(uStarR>0.){vec3 oc=p-uStar;float b=dot(oc,v),c=dot(oc,oc)-uStarR*uStarR,h=b*b-c;
    if(h>0.){ts=-b-sqrt(h);if(ts<0.||ts>tmax)ts=-1.;}
    if(ts<0.&&b<0.){float tc=-b;float d=length(oc+v*tc)/uStarR;float g=uStarGlow*pow(1./max(d,1.),7.)*smoothstep(0.,uStarR*.5,tc);
      if(hp&&tp<tc)g*=.25;col+=tr*uStarCol*g;}}
  if(hp&&(ts<0.||tp<ts))comp(col,tr,planeCol(p+v*tp,v));
  if(ts>0.){vec3 n=normalize(p+v*ts-uStar);float mu=max(dot(n,-v),0.);
    float gran=.8+.45*fbm(n*26.+uTime*.004)+.25*vnoise(n*90.);
    comp(col,tr,vec4(uStarCol*(.3+.7*pow(mu,.6))*gran*1.15,1.));
    if(hp&&tp>ts){}}
}
void main(){
  vec3 rd0=normalize(uBasis*vec3(vUv.x*uTan*uAspect,vUv.y*uTan,-1.));
  vec3 ro=uCam;float r0=length(ro);vec3 rh=ro/r0;float be=sqrt(1./r0);
  float cr=dot(rd0,rh);vec3 v;float gshift=1.;
  if(uFall>.5){v=normalize(rd0+be*rh);gshift=1./max(1.+be*cr,.05);}
  else{vec3 tg=rd0-cr*rh;v=normalize(cr*sqrt(max(1.-be*be,1e-4))*rh+tg);}
  vec3 col=vec3(0.);float tr=1.;
  const float R0=40.;
  float bq=dot(ro,v),disc=bq*bq-(r0*r0-R0*R0);
  vec3 p=ro;bool captured=false;
  // jets et point chaud central, sur le rayon droit
  vec3 add=vec3(0.);
  if(uJet>0.){float b=v.y,d=bq,e=ro.y,den=max(1.-b*b,1e-5);float t=(b*e-d)/den,s=(e-b*d)/den;
    if(t>0.){float da=length(ro+v*t-vec3(0.,s,0.));float as=abs(s);float w=.05*as+1.2;
      float I=exp(-pow(da/w,2.))*smoothstep(1.5,6.,as)*pow(1./(1.+as/uJetLen),1.6)/sqrt(den);
      I*=.55+.6*sin(log(as+1.)*7.-uTime*.25)*.5+.3*vnoise(vec3(log(as+1.)*9.-uTime*.2,s>0.?1.:5.,2.));
      add+=vec3(.55,.62,1.)*uJet*I;}}
  if(uGlow>0.&&bq<0.){float bc=sqrt(max(r0*r0-bq*bq,0.));add+=vec3(.75,.85,1.)*uGlow/(1.+pow(bc/uGlowS,2.5));}
  if(r0<R0||(bq<0.&&disc>0.)){
    if(r0>=R0){float te=-bq-sqrt(disc);straight(p,v,te,col,tr);p+=v*te;}
    vec3 hv=cross(p,v);float h2=dot(hv,hv);
    bool out_=false;
    for(int i=0;i<260;i++){
      float r2=dot(p,p),r=sqrt(r2);
      if(r<1.&&dot(p,v)<0.){captured=true;break;}
      if(r<.02){captured=true;break;}
      if(r>R0*1.02&&dot(p,v)>0.){out_=true;break;}
      float dt=r*mix(.035,.11,smoothstep(1.5,14.,r))/max(length(v),.3);
      v+=-1.5*h2*p/(r2*r2*r)*dt;
      vec3 pn=p+v*dt;
      if(p.y*pn.y<0.&&tr>.01){float f=p.y/(p.y-pn.y);vec3 pc=mix(p,pn,f);if(length(pc.xz)<R0*1.05)comp(col,tr,planeCol(pc,v));}
      p=pn;
    }
    if(!out_)captured=true;
    v=normalize(v);
    if(!captured)straight(p,v,1e20,col,tr);
  }else{
    straight(p,v,1e20,col,tr);
    if(bq<0.){float b=sqrt(max(r0*r0-bq*bq,1e-6));vec3 n=-normalize(ro+v*(-bq));v=normalize(v+n*(2./b));}
  }
  if(captured)tr=0.;
  vec3 bg=skyStars(v,uMWAxis,uMW)*uStarsB;
  if(uFall>.5)bg*=clamp(pow(gshift,3.),0.,8.);
  col+=tr*bg+add*(captured?.25:1.);
  gl_FragColor=vec4(col,1.);
}`;

export function makeBH(kit, o = {}) {
  const u = {
    uCam: { value: new THREE.Vector3() }, uBasis: { value: new THREE.Matrix3() }, uTan: { value: 1 }, uAspect: { value: 1 }, uTime: { value: 0 }, uFall: { value: 0 },
    uDiskIn: { value: 3 }, uDiskOut: { value: 14 }, uDiskB: { value: 1.6 }, uDiskFall: { value: 1.2 }, uDiskSpin: { value: 1 }, uDiskHot: { value: 14000 }, uDiskCool: { value: 2600 },
    uStar: { value: new THREE.Vector3(1e9, 0, 0) }, uStarCol: { value: new THREE.Color(1, 1, 1) }, uStarR: { value: 0 }, uStarGlow: { value: 0.5 },
    uJet: { value: 0 }, uJetLen: { value: 200 }, uGlow: { value: 0 }, uGlowS: { value: 1 }, uMW: { value: 1 }, uStarsB: { value: 1 }, uStream: { value: 0 }, uStreamR: { value: 10 },
    uMWAxis: { value: new THREE.Vector3(0.2, 0.9, 0.38).normalize() },
  };
  for (const k in o) if (u[k]) { if (u[k].value && u[k].value.set && o[k].length) u[k].value.set(...o[k]); else u[k].value = o[k]; }
  const mesh = makeBackdrop(new THREE.ShaderMaterial({ uniforms: u, vertexShader: BACKDROP_VERT, fragmentShader: FRAG }));
  const m4 = new THREE.Matrix4();
  function sync() {
    const c = kit.camera; u.uCam.value.copy(c.position); m4.copy(c.matrixWorld); u.uBasis.value.setFromMatrix4(m4);
    u.uTan.value = Math.tan(c.fov * Math.PI / 360); u.uAspect.value = c.aspect;
  }
  return { mesh, u, sync };
}
// À coller dans le vertex shader de particules proches du trou noir : 0 si la particule est cachée par l'ombre.
export const BH_OCCL = /* glsl */`
float bhVis(vec3 wp){vec3 d=wp-cameraPosition;float L=length(d);d/=L;float tc=-dot(cameraPosition,d);
  if(tc<=0.||tc>=L)return 1.;float b=length(cameraPosition+d*tc);return smoothstep(2.3,2.9,b);}
`;
