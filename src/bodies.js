// Corps célestes réutilisables : étoile à granulation.
import { THREE, NOISE } from './kit.js';
export function starMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: o.T || 5800 }, uB: { value: o.bright || 2 }, uCells: { value: o.cells || 14 }, uTime: { value: 0 }, uContrast: { value: o.contrast ?? 0.5 }, uSpot: { value: o.spot || 0 }, uOp: { value: 1 } },
    transparent: !!o.transparent,
    vertexShader: `varying vec3 vN,vP,vV;void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `precision highp float;varying vec3 vN,vP,vV;uniform float uT,uB,uCells,uTime,uContrast,uSpot,uOp;${NOISE}
void main(){vec3 n=normalize(vP);float mu=max(dot(normalize(vN),vV),0.);
  float g=fbm(n*uCells+vec3(0.,uTime*.15,uTime*.1));float g2=vnoise(n*uCells*4.+uTime*.4);
  float c=1.+uContrast*((g-.5)*2.+(g2-.5)*.5);
  float sp=uSpot*smoothstep(.62,.75,fbm3(n*2.3+7.+uTime*.01));
  float T=uT*(.86+.2*(c-1.)+.14*mu)*(1.-.25*sp);
  vec3 bb=pow(blackbody(T),vec3(1.+clamp((5600.-uT)/1400.,0.,1.5)));vec3 col=bb*uB*c*(.32+.68*pow(mu,.6))*(1.-.6*sp);
  gl_FragColor=vec4(col,uOp);}`,
  });
}
export function makeStar(radius, o = {}) { const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), starMaterial(o)); return m; }
