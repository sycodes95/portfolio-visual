import * as THREE from "three";

// Configuration Types
export interface ParticleColorConfig {
  r: number;
  g: number;
  b: number;
  emissive: {
    r: number;
    g: number;
    b: number;
  };
  lights: {
    color1: { r: number; g: number; b: number };
    color2: { r: number; g: number; b: number };
    color3: { r: number; g: number; b: number };
  };
}

export interface BassConfig {
  subBassIntensity: number;
  lowMidIntensity: number;
  highMidIntensity: number;
  highIntensity: number;
  radiusMultiplier: number;
  radiusPower: number;
  particleScaleMax: number;
  roundnessMultiplier: number;
  lightIntensityMultiplier: number;
  rotationSpeedMax: number;
  enableColorShift: boolean;
  subBassShakeIntensity: number;
  subBassRotationIntensity: number;
  subBassThreshold: number;
  subBassDecay: number;
  subBassAttack: number;
}

export interface ChromaticMode {
  max: number;
  speed: number;
  decay: number;
}

export interface ChromaticConfig {
  modes: {
    SUBTLE: ChromaticMode;
    NORMAL: ChromaticMode;
    INTENSE: ChromaticMode;
    GLITCH: ChromaticMode;
  };
  bassHitMultiplier: number;
  edgeStrength: number;
  distanceStrength: number;
  panInfluence: number;
  waveSpeed: number;
  pulseSpeed: number;
}

export interface ShootingStarConfig {
  enableStars: boolean;
  highMidThreshold: number;
  highFreqThreshold: number;
  combinedThreshold: number;
  maxActiveStars: number;
  starLength: number;
  starWidth: number;
  starSpeed: number;
  starLifetime: number;
  baseOpacity: number;
  fadeRate: number;
  headFormationThreshold: number;
  spawnRate: number;
  headCenterY: number;
  headRadius: number;
}

// OBJ Loader Types
export interface Vertex {
  x: number;
  y: number;
  z: number;
}

export interface OBJData {
  vertices: Vertex[];
  faces: number[][];
}

// Camera Controller Types
export interface CameraControllerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
}

export class CameraController {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  autoRotate: boolean;
  autoRotateSpeed: number;
  azimuthalAngle: number;
  polarAngle: number;
  targetDistance: number;
  distance: number;
  isDragging: boolean;
  previousMouseX: number;
  previousMouseY: number;
  spherical: THREE.Spherical;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  lastTime: number;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement);
  onWheel(e: WheelEvent): void;
  onMouseDown(e: MouseEvent): void;
  onMouseMove(e: MouseEvent): void;
  onMouseUp(): void;
  update(): void;
  dispose(): void;
}

// Audio Analyzer Types
export class AudioAnalyzer {
  context: AudioContext;
  analyzerNode: AnalyserNode;
  analyzerNodeLeft: AnalyserNode;
  analyzerNodeRight: AnalyserNode;
  splitter: ChannelSplitterNode;
  merger: ChannelMergerNode;
  source: MediaElementAudioSourceNode | null;
  binCount: number;
  isConnected: boolean;
  frequencyByteData!: Uint8Array;
  frequencyByteDataLeft!: Uint8Array;
  frequencyByteDataRight!: Uint8Array;
  timeByteData!: Uint8Array;

  constructor(binCount?: number, smoothingTimeConstant?: number);
  setBinCount(binCount: number): void;
  setSmoothingTimeConstant(smoothingTimeConstant: number): void;
  init(audioElement: HTMLAudioElement): Promise<boolean>;
  getFrequencyDataSubBass(): Uint8Array;
  updateSample(): void;
}

// Animation State Types
export interface AnimationState {
  time: number;
  noiseOffset: number;
  randomSeed: number;
  previousBassAvg: number;
  bassHitTime: number;
  shakePhase: number;
  rotationPhase: number;
  subBassPeak: number;
  subBassPeakTime: number;
  lastFrameTime: number;
  chromaticStrength: number;
  chromaticTargetStrength: number;
  chromaticMode: keyof ChromaticConfig['modes'];
  chromaticDirection: THREE.Vector2;
  chromaticWavePhase: number;
  chromaticPulsePhase: number;
  lastBassHitTime: number;
  overallEnergy: number;
  lastStarSpawnTime: number;
  headFormationProgress: number;
  currentParticleScale: number;
  chromaticTracer: number;
  chromaticTracerStartTime: number;
  chromaticTracerActive: boolean;
  colorInversionProgress: number;
  colorInversionTarget: number;
  persistentInversion: number;
  tempInversionActive: boolean;
  tempInversionStart: number;
}

// Rotating Geometry Types
export interface RotatingGeometry {
  mesh: THREE.Group;
  material: THREE.PointsMaterial;
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  type: 'sphere' | 'cube' | 'pyramid';
  baseRotationSpeed: number;
  currentRotationSpeed: number;
  scale: number;
  orbitRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
  pathProgress: number;
  frequencyResponse: number;
  baseScale: number;
  expansionScale: number;
}

// Shooting Star Types
export interface ShootingStar {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  lifetime: number;
  startPosition: { x: number; y: number; z: number };
  currentPosition: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  speed: number;
  intensity: number;
  baseIntensity: number;
}

// Shader Uniforms Types
export interface ChromaticAberrationUniforms {
  tDiffuse: { value: THREE.Texture | null };
  uChromaticStrength: { value: number };
  uChromaticDirection: { value: THREE.Vector2 };
  uScreenSize: { value: THREE.Vector2 };
  uTime: { value: number };
  uWavePhase: { value: number };
  uEdgeStrength: { value: number };
  uDistanceStrength: { value: number };
}

export interface ParticleShaderUniforms {
  uTime: { value: number };
  uPath: { value: Float32Array };
  uRadius: { value: Float32Array };
  uShake: { value: Float32Array };
  uRotation: { value: Float32Array };
  uPan: { value: Float32Array };
  uRoundness: { value: THREE.Vector2 };
  uParticleScale: { value: number };
  uEmissive: { value: THREE.Color };
  uLightPos1: { value: THREE.Vector3 };
  uLightPos2: { value: THREE.Vector3 };
  uLightPos3: { value: THREE.Vector3 };
  uLightColor1: { value: THREE.Color };
  uLightColor2: { value: THREE.Color };
  uLightColor3: { value: THREE.Color };
  uLightIntensity1: { value: number };
  uLightIntensity2: { value: number };
  uLightIntensity3: { value: number };
  uColorInversion: { value: number };
}

// Scene Reference Types
export interface SceneLights {
  light1: THREE.PointLight;
  light2: THREE.DirectionalLight;
  light3: THREE.DirectionalLight;
}

export interface ChromaticShader {
  uniforms: ChromaticAberrationUniforms;
  vertexShader: string;
  fragmentShader: string;
}

export interface SceneRef {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: CameraController;
  particles: THREE.Mesh;
  pathPositions: Float32Array;
  radiusArray: Float32Array;
  shakeArray: Float32Array;
  rotationArray: Float32Array;
  panArray: Float32Array;
  lights: SceneLights;
  analyzer: AudioAnalyzer | undefined;
  renderTarget: THREE.WebGLRenderTarget;
  postScene: THREE.Scene;
  postCamera: THREE.OrthographicCamera;
  postQuad: THREE.Mesh;
  chromaticShader: ChromaticShader;
  shootingStars: ShootingStar[];
  rotatingGeometries: RotatingGeometry[];
}

// Helper function types
export type CatmullRomFunction = (
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
) => number;

export type LoadOBJFunction = (url: string) => Promise<OBJData>;