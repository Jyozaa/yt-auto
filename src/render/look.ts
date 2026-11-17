// Compositor settings from Bridge.tsx. Copyright (c) 2026 Mr omi. See docs/LICENSE-MR-OMI.
import * as T from 'three';
import {BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode} from 'postprocessing';
import {cancelRender} from 'remotion';
import {InkPass} from '../engine/effects/ink';
import {LensBlur} from '../engine/effects/lensblur';
import {GradeEffect, GRADE_STRENGTH, GRADES} from '../engine/effects/grade';

export function makeLook(canvas: HTMLCanvasElement, scene: T.Scene, camera: T.PerspectiveCamera,
  width: number, height: number, samples: number, opticalBlur: boolean) {
  const renderer = new T.WebGLRenderer({canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.debug.onShaderError = (gl, _program, vertex, fragment) => {
    cancelRender(new Error(`WebGL shader failed: ${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)}`));
  };
  const composer = new EffectComposer(renderer, {frameBufferType: T.HalfFloatType, multisampling: samples});
  const lens = new LensBlur({maxCoC: 24, nearScale: 1.2});
  const bloom = new BloomEffect({blendFunction: BlendFunction.ADD, intensity: .5, luminanceThreshold: 1,
    luminanceSmoothing: .2, mipmapBlur: true, levels: 6, radius: .6});
  const mip = bloom.mipmapBlurPass;
  const resizeMip = mip.setSize.bind(mip);
  mip.setSize = (w, h) => resizeMip(Math.round(1920 * w / Math.max(h, 1)), 1920);
  const grade = new GradeEffect(GRADES.day, GRADE_STRENGTH.day);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new InkPass(scene, camera));
  if (opticalBlur) {
    composer.addPass(new EffectPass(camera, lens.pre));
    composer.addPass(new EffectPass(camera, lens.main));
  }
  composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({mode: ToneMappingMode.NEUTRAL}), grade));
  composer.setSize(width, height);
  let currentLight: keyof typeof GRADES = 'day';
  return {
    draw(focus: number, blur: number, light: keyof typeof GRADES, repair = false) {
      lens.focus = focus;
      lens.cInf = blur * (repair ? .62 : 1);
      if (currentLight !== light) { grade.set(GRADES[light]); currentLight = light; }
      grade.amount = GRADE_STRENGTH[light] * (repair ? .76 : 1);
      composer.render(1 / 30);
    },
    dispose() {
      if (!opticalBlur) { lens.pre.dispose(); lens.main.dispose(); }
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
