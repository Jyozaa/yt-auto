// Imperative Remotion host for the upstream Bridge.tsx composition.
// Copyright (c) 2026 Mr omi. See docs/LICENSE-MR-OMI.
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Composition, cancelRender, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import * as T from 'three';
import {makeLook} from './look';
import {loadKit, World} from '../engine/reference/world';
import {type Kit} from '../engine/world/build';
import {FLASH_AT, FPS, SHOTS, TOTAL, dofAt, layersAt} from '../engine/reference/story';
import {noInkFallback} from '../engine/effects/ink';

function BridgeView({id, alpha, kit, samples}: {id: number; alpha: number; kit: Kit; samples: number}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<(id: number, frame: number) => void>(null);
  useLayoutEffect(() => {
    const world = new World(kit);
    const scene = new T.Scene();
    scene.add(world.root);
    const camera = new T.PerspectiveCamera(40, width / height, .2, 1500);
    const look = makeLook(canvas.current!, scene, camera, width, height, samples, true);
    const direction = new T.Vector3();
    const focus = new T.Vector3();
    view.current = (shot, at) => {
      const target = world.update(shot, at, camera, scene);
      noInkFallback(world.root);
      const lens = dofAt(at);
      const key = lens.focus;
      if (key) focus.set(...key(at)); else focus.copy(target);
      const distance = Math.max(.3, focus.sub(camera.position).dot(camera.getWorldDirection(direction)));
      look.draw(distance, lens.cInf, SHOTS[shot - 1].light);
    };
    return () => { look.dispose(); world.dispose(); };
  }, [width, height, kit, samples]);
  useLayoutEffect(() => { view.current!(id, frame); });
  return <canvas ref={canvas} width={width} height={height} style={{position: 'absolute', inset: 0, opacity: alpha}}/>;
}

type BaselineProps = {width: number; height: number; samples: number};

function SourceStyleBaseline({samples}: BaselineProps) {
  const frame = useCurrentFrame();
  const [kit, setKit] = useState<Kit>();
  const [handle] = useState(() => delayRender('Load source baseline props'));
  useEffect(() => { loadKit().then(setKit).catch(cancelRender); }, []);
  useEffect(() => { if (kit) continueRender(handle); }, [kit, handle]);
  const flash = frame >= FLASH_AT && frame < FLASH_AT + 4 ? [1, .75, .45, .2][frame - FLASH_AT] : 0;
  return <AbsoluteFill style={{background: '#cfe3f2'}}>
    {kit && layersAt(frame).map((layer, index) => <BridgeView key={index} {...layer} kit={kit} samples={samples}/>)}
    {flash > 0 && <AbsoluteFill style={{background: '#fff', opacity: flash}}/>}
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="SourceStyleBaseline" component={SourceStyleBaseline}
  fps={FPS} durationInFrames={TOTAL} width={540} height={960} defaultProps={{width: 540, height: 960, samples: 0}}
  calculateMetadata={({props}) => ({width: props.width, height: props.height})}/>);
