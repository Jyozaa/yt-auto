import {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import {Stage} from '../engine/world/stage';
import {makeLook} from './look';
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
  offset?: number;
};

function makeView(canvas: HTMLCanvasElement, shot: Shot, film: Film, width: number, height: number, repair: boolean, samples: number) {
  const stage = new Stage(shot, film.story, width, height);
  const blur = shot.beat.camera.blur > 0 || (shot.cameraKeys ?? []).some((key) => (key.blur ?? 0) > 0);
  const look = makeLook(canvas, stage.scene, stage.camera, width, height, samples, blur);
  return {
    draw(frame: number) {
      const focus = stage.update(frame);
      look.draw(focus.distance, focus.blur, shot.scene.light, repair);
    },
    dispose() { look.dispose(); stage.dispose(); }
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

function Short({film, repair, samples, offset = 0}: Props) {
  const frame = useCurrentFrame() + offset;
  const index = film.shots.findIndex((shot) => frame < shot.end);
  const shot = film.shots[index];
  const fade = index > 0 && shot.beat.transition === 'dissolve' ? smooth((frame - shot.start) / 7) : 1;
  return <AbsoluteFill style={{background: '#1c202b'}}>
    {fade < 1 && <View key={index - 1} film={film} shot={film.shots[index - 1]} frame={shot.start - 1 + Math.floor((frame - shot.start) * .30)}
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
