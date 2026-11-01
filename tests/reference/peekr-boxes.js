// Reference code from Peekr 1.0.7 (npm package `peekr`, file dist/index.js,
// https://registry.npmjs.org/peekr/-/peekr-1.0.7.tgz), used only by the parity
// tests in tests/parity/peekr-*.test.ts (spec §10.3 WP7). It is never shipped.
//
// - `B` (convertToYolo) and `C` (collectCoordinates) are copied verbatim from
//   the minified bundle.
// - `E_geometry` is the box, kps and crop part of the bundle's `E`
//   (onResultsFaceMesh), copied verbatim; only the two drawImage calls are
//   recorded instead of drawn, and the function returns what `E` posts as kps.
// - `F` (preprocess) uses ndarray and ndarray-ops, which are not copied here;
//   `F_transcribed` writes out what those calls do for F's arguments (shapes
//   [a, s, 4] and [1, 3, s, a], row-major strides; assign iterates over the
//   destination's shape).
//
// The original notice follows.
//
// MIT License
//
// Copyright (c) 2025 AryamanTaore
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/* eslint-disable */

// ----- Verbatim from dist/index.js -----
export function B(r,a,s){let t=(r[0][0]+r[2][0])/2,e=(r[1][1]+r[3][1])/2,n=r[2][0]-r[0][0],o=r[3][1]-r[1][1],i=[t,e,n,o];return n=i[2]*a,o=i[3]*s,[(i[0]-i[2]/2)*a,(i[1]-i[3]/2)*s,n,o]}
export function C(r,a,s){a.forEach(a=>{const t=r[a];s.push([t.x,t.y])})}

// ----- From E, verbatim apart from the recorded drawImage calls -----
// `r` is a FaceMesh results object ({ multiFaceLandmarks: [landmarks] }) and
// `w` stands for the <video> element ({ videoWidth, videoHeight }). Returns
// null where E returns early, else the kps E posts (as a Float32Array, which
// is what E's ndarray copy produces) and the drawImage arguments of input1
// (first) and input2.
export function E_geometry(r,w){const draws=[],I={drawImage:(...x)=>draws.push(x)},N=I;
if(!r.multiFaceLandmarks||0===r.multiFaceLandmarks.length)return null;const a=r.multiFaceLandmarks[0],s=w.videoWidth,t=w.videoHeight,e=[],n=[];if(C(a,[130,27,243,23],e),C(a,[463,257,359,253],n),0===e.length||0===n.length)return null;let[o,i,h,l]=B(e,s,t);const c=[o/s,i/t,h/s,l/t];I.drawImage(w,Math.max(0,s-o-h),Math.max(0,i),Math.max(0,h),Math.max(0,l),0,0,128,128),[o,i,h,l]=B(n,s,t),c.push(o/s,i/t,h/s,l/t),N.drawImage(w,Math.max(0,s-o-h),Math.max(0,i),Math.max(0,h),Math.max(0,l),0,0,128,128);
return{kps:new Float32Array(c),draws}}

// ----- F, with its ndarray calls written out -----
// Bundle: function F(r,a,s){const t=u(new Float32Array(r),[a,s,4]),e=u(new Float32Array(a*s*3),[1,3,s,a]);
//   return v.divseq(t,255),v.assign(e.pick(0,0,null,null),t.pick(null,null,2)),v.assign(e.pick(0,1,null,null),
//   t.pick(null,null,1)),v.assign(e.pick(0,2,null,null),t.pick(null,null,0)),new Float32Array(e.data)}
export function F_transcribed(r,a,s){
  const t=new Float32Array(r);
  for(let k=0;k<t.length;k++)t[k]/=255; // v.divseq(t,255)
  const e=new Float32Array(a*s*3);
  // e.pick(0,c,null,null): shape [s,a], strides [a,1], offset c·s·a.
  // t.pick(null,null,2−c): strides [4s,4], offset 2−c, read at the same index pair.
  for(let c=0;c<3;c++)for(let i0=0;i0<s;i0++)for(let i1=0;i1<a;i1++)e[c*s*a+i0*a+i1]=t[i0*4*s+i1*4+(2-c)];
  return new Float32Array(e);
}
