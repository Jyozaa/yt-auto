import {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, Composition, cancelRender, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import * as T from 'three';
import {BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode} from 'postprocessing';
import {Stage} from '../engine/world/stage';
import {InkPass} from '../engine/effects/ink';
import {LensBlur} from '../engine/effects/lensblur';
import {GradeEffect, GRADES} from '../engine/effects/grade';
import {smooth} from '../engine/camera/choreography';
import type {Film, Shot} from '../story/timeline';
import {fps, storySchema, wordsOf} from '../story/schema';
import {compile} from '../story/timeline';
import example from '../../examples/foucault.json';

export type Props = {
  film: Film;
  width: number;
  height: number;
  frames: number;
  repair: number[];
  samples: number;
};

function makeView(canvas: HTMLCanvasElement, shot: Shot, film: Film, width: number, height: number, repair: boolean, samples: number) {
  const renderer = new T.WebGLRenderer({canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.debug.onShaderError = (gl, _program, vertex, fragment) => {
    cancelRender(new Error(`WebGL shader failed: ${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)}`));
  };
  const stage = new Stage(shot, film.story, width, height);
  const composer = new EffectComposer(renderer, {frameBufferType: T.HalfFloatType, multisampling: samples});
  const ink = new InkPass(stage.scene, stage.camera, {widthNear: width < 540 ? 5.8 : 4.2, widthFar: 3.15});
  const lens = new LensBlur({maxCoC: 24});
  const bloom = new BloomEffect({blendFunction: BlendFunction.ADD, intensity: .42, luminanceThreshold: 1,
    luminanceSmoothing: .18, mipmapBlur: true, levels: 4, radius: .62});
  const tone = new ToneMappingEffect({mode: ToneMappingMode.NEUTRAL});
  const grade = new GradeEffect(GRADES[shot.scene.light], repair ? .76 : 1);
  composer.addPass(new RenderPass(stage.scene, stage.camera));
  composer.addPass(ink);
  if (shot.beat.camera.blur > 0) {
    composer.addPass(new EffectPass(stage.camera, lens.pre));
    composer.addPass(new EffectPass(stage.camera, lens.main));
  }
  composer.addPass(new EffectPass(stage.camera, bloom, tone, grade));
  composer.setSize(width, height);
  return {
    draw(frame: number) {
      const focus = stage.update(frame, height);
      lens.focus = focus.distance;
      lens.cInf = focus.blur * (repair ? .62 : 1);
      composer.render(1 / fps);
    },
    dispose() {
      if (shot.beat.camera.blur === 0) { lens.pre.dispose(); lens.main.dispose(); }
      composer.dispose();
      stage.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}

function View({film, shot, frame, alpha, repair, samples}: {
  film: Film; shot: Shot; frame: number; alpha: number; repair: boolean; samples: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<ReturnType<typeof makeView>>(null);
  const {width, height} = useVideoConfig();
  useLayoutEffect(() => {
    const instance = makeView(canvas.current!, shot, film, width, height, repair, samples);
    view.current = instance;
    return () => instance.dispose();
  }, [film, shot, width, height, repair, samples]);
  useLayoutEffect(() => { view.current!.draw(frame); });
  return <canvas ref={canvas} width={width} height={height} style={{position: 'absolute', inset: 0, opacity: alpha}} />;
}

function Short({film, repair, samples}: Props) {
  const frame = useCurrentFrame();
  const index = film.shots.findIndex((shot) => frame < shot.end);
  const shot = film.shots[index];
  const fade = index > 0 && shot.beat.transition === 'dissolve' ? smooth((frame - shot.start) / 7) : 1;
  return <AbsoluteFill style={{background: '#1c202b'}}>
    {fade < 1 && <View key={index - 1} film={film} shot={film.shots[index - 1]} frame={shot.start - 1}
      alpha={1} repair={repair.includes(index - 1)} samples={samples}/>}
    <View key={index} film={film} shot={shot} frame={frame} alpha={fade} repair={repair.includes(index)} samples={samples}/>
  </AbsoluteFill>;
}

const story = storySchema.parse(example);
const count = wordsOf(story.narration).length;
const defaultFilm = compile(story, {
  duration: 60, provider: 'studio layout',
  words: wordsOf(story.narration).map((word, i) => ({word, start: i * 59.8 / count, end: (i + .8) * 59.8 / count}))
});
const defaults: Props = {film: defaultFilm, width: 360, height: 640, frames: defaultFilm.frames, repair: [], samples: 0};

function Root() {
  return <Composition id="StoryShort" component={Short} fps={fps} width={defaults.width} height={defaults.height}
    durationInFrames={defaults.frames} defaultProps={defaults}
    calculateMetadata={({props}) => ({
      width: props.width, height: props.height, durationInFrames: props.frames
    })}/>;
}
registerRoot(Root);
