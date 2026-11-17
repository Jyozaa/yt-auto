import * as THREE from 'three';
import {NOINK} from '../effects/ink';
import type {Story} from '../../story/schema';
import {cardShade, CARD_K} from './cardshade';

const ink = '#271b30';
export type Pose = {walk: number; bob: number; lean: number; point: number; surprise: number; blink: boolean};

export class Actor {
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(private readonly character: Story['characters'][number], shadowMap: THREE.Texture) {
    this.canvas.width = 240;
    this.canvas.height = 400;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 2;
    const material = new THREE.MeshLambertMaterial({map: this.texture, alphaTest: 0.43, side: THREE.DoubleSide});
    cardShade(material);
    const h = character.height / 0.86;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.6, h), material);
    this.mesh.geometry.translate(0, h * 0.476, 0);
    this.mesh.layers.set(NOINK);
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      map: this.texture, alphaTest: 0.43, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide
    });
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.51), new THREE.MeshBasicMaterial({
      map: shadowMap, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
    }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.layers.set(NOINK);
  }

  draw(pose: Pose, facing: number, height: number) {
    CARD_K.uPx.value = height / 1920;
    const g = this.g;
    const c = this.character;
    g.setTransform(facing, 0, 0, 1, facing < 0 ? 240 : 0, 0);
    g.clearRect(0, 0, 240, 400);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const stroke = (points: number[][], width: number, color = ink) => {
      g.beginPath();
      g.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) g.lineTo(x, y);
      g.strokeStyle = color;
      g.lineWidth = width;
      g.stroke();
    };
    const dot = (x: number, y: number, r: number, fill = ink) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
    };
    const step = pose.walk * 35;
    const body = 265 - pose.bob * 10;
    for (const side of [-1, 1]) {
      const foot = 120 + side * (17 + step);
      const ground = 387 - Math.max(0, -side * pose.walk) * 23;
      stroke([[120 + side * 14, body], [124 + side * (12 + step * .55), (body + ground) / 2], [foot, ground]], 8, c.trousers);
      stroke([[foot - 4, ground], [foot + 11, ground]], 10);
    }
    g.save();
    g.translate(122, body);
    g.rotate(pose.lean * .26);
    g.translate(-122, -265);
    stroke([[101, 183], [79, 222 - step * .38], [88 - step * .58, 249 - pose.surprise * 45]], 6);
    dot(88 - step * .58, 249 - pose.surprise * 45, 6, c.skin);
    g.beginPath();
    g.moveTo(103, 168);
    g.bezierCurveTo(83, 191, 89, 240, c.outfit === 'dress' ? 73 : 91, 269);
    g.quadraticCurveTo(120, 285, c.outfit === 'dress' ? 165 : 151, 267);
    g.bezierCurveTo(155, 220, 152, 176, 132, 169);
    g.closePath();
    const coat = g.createLinearGradient(91, 210, 152, 234);
    coat.addColorStop(0, c.coat);
    coat.addColorStop(.62, c.coat);
    coat.addColorStop(1, ink);
    g.fillStyle = coat;
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 4.5;
    g.stroke();
    if (c.outfit === 'waistcoat') {
      stroke([[101, 173], [125, 221], [139, 172]], 4, '#f2dbb4');
      stroke([[125, 223], [126, 264]], 2.2);
    } else {
      stroke([[104, 175], [117, 194], [134, 173]], 4, '#f2dbb4');
      stroke([[117, 197], [118, 256]], 2);
    }
    for (let y = 230; y < 261; y += 11) dot(132, y, 2, '#e5bb67');
    const hand = [157 + pose.point * 37 + step * .42, 241 - pose.point * 65 - pose.surprise * 29];
    stroke([[144, 183], [155 + pose.point * 13, 215 - pose.point * 32], hand], 7);
    dot(hand[0], hand[1], 7, c.skin);

    g.translate(0, -pose.surprise * 3);
    g.beginPath();
    g.moveTo(77, 112);
    g.bezierCurveTo(76, 76, 101, 53, 130, 55);
    g.bezierCurveTo(164, 56, 181, 85, 177, 114);
    g.bezierCurveTo(178, 147, 160, 168, 130, 172);
    g.bezierCurveTo(101, 172, 77, 150, 77, 112);
    const skin = g.createLinearGradient(93, 78, 160, 179);
    skin.addColorStop(0, c.skin);
    skin.addColorStop(.76, c.skin);
    skin.addColorStop(1, '#b67567');
    g.fillStyle = skin;
    g.fill();
    g.lineWidth = 3.4;
    g.stroke();
    g.beginPath();
    g.moveTo(79, 121);
    g.bezierCurveTo(65, 103, 72, 72, 97, 58);
    g.bezierCurveTo(112, 45, 148, 46, 169, 66);
    g.quadraticCurveTo(180, 78, 172, 88);
    g.quadraticCurveTo(153, 85, 140, 78);
    g.quadraticCurveTo(122, 99, 88, 105);
    g.lineTo(87, 128);
    g.closePath();
    g.fillStyle = c.hair;
    g.fill();
    g.lineWidth = 5.5;
    g.stroke();
    dot(91, 128, 8, c.skin);
    stroke([[86, 131], [91, 135]], 2.4, '#784956');
    for (const x of [121, 151]) {
      const y = 116 - pose.surprise * 2;
      stroke([[x - 5, 106 - pose.surprise * 7], [x + 4, 104 - pose.surprise * 5]], 2.8);
      if (pose.blink) stroke([[x - 4, y], [x + 4, y]], 2.5);
      else {
        g.beginPath();
        g.ellipse(x + 2, y, 3.5, 5 + pose.surprise * 2, 0, 0, Math.PI * 2);
        g.fillStyle = ink;
        g.fill();
      }
    }
    stroke([[140, 119], [145, 131], [140, 133]], 2.4, '#8b535a');
    if (pose.surprise > .15) dot(139, 148, 3 + pose.surprise * 5);
    else {
      g.beginPath();
      g.moveTo(126, 146);
      g.quadraticCurveTo(137, 155, 150, 144);
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.stroke();
    }
    g.restore();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.mesh.material.dispose();
    this.mesh.customDepthMaterial?.dispose();
    this.mesh.geometry.dispose();
    this.shadow.material.dispose();
    this.shadow.geometry.dispose();
  }
}
