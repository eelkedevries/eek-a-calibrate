// Vendored from WebEyeTrack (https://github.com/RedForestAI/WebEyeTrack),
// js/src/utils/safeSVD.ts at commit 75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c.
// Every change from upstream is listed in UPSTREAM.md; nothing else differs.
//
// MIT License
//
// Copyright (c) 2025 (Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas)
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

import { SVD, Matrix } from 'ml-matrix';

/**
 * Calls SVD with autoTranspose disabled and suppresses the known warning.
 */
export function safeSVD(A: Matrix): SVD {
  const originalWarn = console.warn;
  console.warn = function (...args: any[]) {
    const msg = args[0];
    if (typeof msg === 'string' && msg.includes('autoTranspose')) {
      return; // suppress only this specific message
    }
    originalWarn.apply(console, args);
  };

  const result = new SVD(A, { autoTranspose: false });

  console.warn = originalWarn;
  return result;
}
