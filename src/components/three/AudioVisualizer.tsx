import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { hush_borne } from "../../assets/mp3s";

// Particle color configuration - Easy to change!
const PARTICLE_COLOR = {
  // Main particle color (RGB values 0-1)
  r: 1.0, // Red
  g: 1.0, // Green
  b: 1.0, // Blue

  // Emissive glow color
  emissive: {
    r: 1.0,
    g: 1.0,
    b: 1.0,
  },

  // Light colors (set to white for natural lighting, or match particle color)
  lights: {
    color1: { r: 1, g: 1, b: 1 }, // White lighting
    color2: { r: 1, g: 1, b: 1 },
    color3: { r: 1, g: 1, b: 1 },
  },
};

const aud = hush_borne;

// Camera Controller
class CameraController {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  autoRotate = true;
  autoRotateSpeed = 0.1;
  rotationY = 0;
  targetDistance = 1200;
  distance = 1200;
  isDragging = false;
  previousMouseX = 0;
  previousMouseY = 0;
  spherical = new THREE.Spherical();
  minDistance = 50;
  maxDistance = 1500;
  minPolarAngle = Math.PI * 0.4;
  maxPolarAngle = Math.PI * 0.6;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.distance = 1200;
    this.targetDistance = 1200;
    this.rotationY = 0;

    this.domElement.addEventListener("wheel", this.onWheel.bind(this));
    this.domElement.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.domElement.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.domElement.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.domElement.addEventListener("mouseleave", this.onMouseUp.bind(this));
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    this.targetDistance += e.deltaY * 0.5;
    this.targetDistance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.targetDistance),
    );
  }

  onMouseDown(e: MouseEvent) {
    this.isDragging = true;
    this.previousMouseX = e.clientX;
    this.previousMouseY = e.clientY;
  }

  onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.previousMouseX;
    const deltaY = e.clientY - this.previousMouseY;

    this.rotationY -= deltaX * 0.01;

    this.previousMouseX = e.clientX;
    this.previousMouseY = e.clientY;
  }

  onMouseUp() {
    this.isDragging = false;
  }

  update() {
    if (this.autoRotate && !this.isDragging) {
      this.rotationY += this.autoRotateSpeed * 0.005;
    }

    this.distance += (this.targetDistance - this.distance) * 0.05;

    this.camera.position.x = Math.sin(this.rotationY) * this.distance;
    this.camera.position.z = Math.cos(this.rotationY) * this.distance;
    this.camera.position.y = 0;
    this.camera.lookAt(0, 0, 0);
  }

  dispose() {
    this.domElement.removeEventListener("wheel", this.onWheel.bind(this));
    this.domElement.removeEventListener(
      "mousedown",
      this.onMouseDown.bind(this),
    );
    this.domElement.removeEventListener(
      "mousemove",
      this.onMouseMove.bind(this),
    );
    this.domElement.removeEventListener("mouseup", this.onMouseUp.bind(this));
    this.domElement.removeEventListener(
      "mouseleave",
      this.onMouseUp.bind(this),
    );
  }
}

// Audio Analyzer with Stereo Support
class AudioAnalyzer {
  context: AudioContext;
  analyzerNode: AnalyserNode;
  analyzerNodeLeft: AnalyserNode;
  analyzerNodeRight: AnalyserNode;
  splitter: ChannelSplitterNode;
  merger: ChannelMergerNode;
  source: MediaElementAudioSourceNode | null = null;
  frequencyByteData: Uint8Array;
  frequencyByteDataLeft: Uint8Array;
  frequencyByteDataRight: Uint8Array;
  timeByteData: Uint8Array;
  binCount: number;
  isConnected = false;

  constructor(binCount: number = 1024, smoothingTimeConstant: number = 0.85) {
    this.context = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    // Main analyzer for combined audio
    this.analyzerNode = this.context.createAnalyser();

    // Separate analyzers for left and right channels
    this.analyzerNodeLeft = this.context.createAnalyser();
    this.analyzerNodeRight = this.context.createAnalyser();

    // Splitter and merger for stereo processing
    this.splitter = this.context.createChannelSplitter(2);
    this.merger = this.context.createChannelMerger(2);

    this.binCount = binCount;
    this.setBinCount(binCount);
    this.setSmoothingTimeConstant(smoothingTimeConstant);
  }

  setBinCount(binCount: number) {
    this.binCount = binCount;
    this.analyzerNode.fftSize = binCount * 2;
    this.analyzerNodeLeft.fftSize = binCount * 2;
    this.analyzerNodeRight.fftSize = binCount * 2;
    this.frequencyByteData = new Uint8Array(binCount);
    this.frequencyByteDataLeft = new Uint8Array(binCount);
    this.frequencyByteDataRight = new Uint8Array(binCount);
    this.timeByteData = new Uint8Array(binCount);
  }

  setSmoothingTimeConstant(smoothingTimeConstant: number) {
    this.analyzerNode.smoothingTimeConstant = smoothingTimeConstant;
    this.analyzerNodeLeft.smoothingTimeConstant = smoothingTimeConstant;
    this.analyzerNodeRight.smoothingTimeConstant = smoothingTimeConstant;
  }

  async init(audioElement: HTMLAudioElement) {
    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      if (!this.source && !this.isConnected) {
        this.source = this.context.createMediaElementSource(audioElement);

        // Connect source to splitter
        this.source.connect(this.splitter);

        // Connect left and right channels to their respective analyzers
        this.splitter.connect(this.analyzerNodeLeft, 0);
        this.splitter.connect(this.analyzerNodeRight, 1);

        // Connect to merger for output
        this.analyzerNodeLeft.connect(this.merger, 0, 0);
        this.analyzerNodeRight.connect(this.merger, 0, 1);

        // Also connect to main analyzer for combined analysis
        this.source.connect(this.analyzerNode);

        // Connect to destination
        this.merger.connect(this.context.destination);
        this.analyzerNode.connect(this.context.destination);

        this.isConnected = true;
      }

      return true;
    } catch (error) {
      console.error("Error initializing audio:", error);
      return false;
    }
  }

  getFrequencyData() {
    return this.frequencyByteData;
  }

  getFrequencyDataLeft() {
    return this.frequencyByteDataLeft;
  }

  getFrequencyDataRight() {
    return this.frequencyByteDataRight;
  }

  getTimeData() {
    return this.timeByteData;
  }

  getAverage(index?: number, count?: number) {
    let total = 0;
    const start = index || 0;
    const end = start + (count || this.binCount);
    for (let i = start; i < end; i++) {
      total += this.frequencyByteData[i];
    }
    return total / (end - start);
  }

  getAverageFloat(index?: number, count?: number) {
    return this.getAverage(index, count) / 255;
  }

  updateSample() {
    this.analyzerNode.getByteFrequencyData(this.frequencyByteData);
    this.analyzerNodeLeft.getByteFrequencyData(this.frequencyByteDataLeft);
    this.analyzerNodeRight.getByteFrequencyData(this.frequencyByteDataRight);
    this.analyzerNode.getByteTimeDomainData(this.timeByteData);
  }
}

const BASS_CONFIG = {
  // 5 frequency sections
  subBassIntensity: 0.5, // 20-60 Hz
  lowBassIntensity: 0.6, // 60-250 Hz
  lowMidIntensity: 0.8, // 250-500 Hz
  highMidIntensity: 0.9, // 500-2000 Hz
  highIntensity: 0.7, // 2000+ Hz

  radiusMultiplier: 15,
  radiusPower: 8,
  particleScaleMax: 2,
  roundnessMultiplier: 4,
  lightIntensityMultiplier: 6,
  rotationSpeedMax: 3,
  enableColorShift: true,

  // Shake parameters for sub-bass
  subBassShakeIntensity: 8, // Erratic shake multiplier
  // Rotation for sub-bass
  subBassRotationIntensity: 1, // Spine rotation intensity
  subBassSpinePercent: 0.1, // 10% of spine
  lowBassSpinePercent: 0.3, // 30% of spine
  individualShakeIntensity: 25, // Individual particle shake
  kickDecayThreshold: 0.85, // 85% volume threshold
  kickDecayTime: 200, // 200ms decay
  kickDecayAmount: 0.5, // Drop to 50% effect
};

// Helper functions
function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t * t * t;
  return (
    (2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 +
    (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 +
    v0 * t +
    p1
  );
}

const AudioVisualizer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: CameraController;
    particles: THREE.Mesh;
    pathPositions: Float32Array;
    radiusArray: Float32Array;
    shakeArray: Float32Array;
    rotationArray: Float32Array; // New array for spine rotation
    panArray: Float32Array; // New array for stereo panning
    analyzer?: AudioAnalyzer;
    lights: {
      light1: THREE.PointLight;
      light2: THREE.DirectionalLight;
      light3: THREE.DirectionalLight;
    };
  } | null>(null);
  const frameId = useRef<number>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [debugInfo, setDebugInfo] = useState("Loading...");
  const isPlayingRef = useRef(false);

  const pathLength = 256;
  const particleCount = 100000;
  const prefabDelay = 0.00014;
  const vertexDelay = 0.005;
  const minDuration = 40;
  const maxDuration = 600;

  const animState = useRef({
    time: 0,
    noiseOffset: 0,
    randomSeed: Math.random() * 1000,
    previousBassAvg: 0,
    bassHitTime: 0,
    shakePhase: 0,
    rotationPhase: 0, // For spine rotation
    smoothedSubBassAvg: 0,
    smoothedLowBassAvg: 0,
    previousSubBassAvg: 0,
    previousLowBassAvg: 0,
    lastKickTime: 0,
    kickDecayActive: false,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    console.log(
      "Initializing 100,000 particle system with 5 frequency sections...",
    );

    // Scene setup
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      10000,
    );
    camera.position.set(0, 0, 5000);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    containerRef.current.appendChild(renderer.domElement);

    // Lights
    const light1 = new THREE.PointLight(0xffffff, 0.25, 1200, 2);
    light1.position.set(0, 0, 0);
    light1.color.setRGB(
      PARTICLE_COLOR.lights.color1.r,
      PARTICLE_COLOR.lights.color1.g,
      PARTICLE_COLOR.lights.color1.b,
    );
    scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xffffff, 0.25);
    light2.position.set(0, 1, 1);
    light2.color.setRGB(
      PARTICLE_COLOR.lights.color2.r,
      PARTICLE_COLOR.lights.color2.g,
      PARTICLE_COLOR.lights.color2.b,
    );
    scene.add(light2);

    const light3 = new THREE.DirectionalLight(0xffffff, 0.25);
    light3.position.set(0, 1, -1);
    light3.color.setRGB(
      PARTICLE_COLOR.lights.color3.r,
      PARTICLE_COLOR.lights.color3.g,
      PARTICLE_COLOR.lights.color3.b,
    );
    scene.add(light3);

    // Camera controller
    const controls = new CameraController(camera, renderer.domElement);

    // Create path
    const pathPositions = new Float32Array(pathLength * 3);
    const radiusArray = new Float32Array(pathLength);
    const shakeArray = new Float32Array(pathLength * 3); // Spine shake
    const rotationArray = new Float32Array(pathLength);
    const panArray = new Float32Array(pathLength);
    const individualShakeArray = new Float32Array(pathLength * 3); // NEW: Individual particle shake
    const kickDecayArray = new Float32Array(pathLength);

    for (let i = 0; i < pathLength; i++) {
      let x, y, z;

      if (i === 0) {
        x = 0;
        y = -1400;
        z = 0;
      } else if (i === pathLength - 1) {
        x = 0;
        y = 1200;
        z = 0;
      } else {
        x = (Math.random() - 0.5) * 400;
        y = -400 + (800 / pathLength) * i + (Math.random() - 0.5) * 200;
        z = (Math.random() - 0.5) * 400;
      }

      pathPositions[i * 3] = x;
      pathPositions[i * 3 + 1] = y;
      pathPositions[i * 3 + 2] = z;
      radiusArray[i] = 0;
      shakeArray[i * 3] = 0;
      shakeArray[i * 3 + 1] = 0;
      shakeArray[i * 3 + 2] = 0;
      rotationArray[i] = 0;
      panArray[i] = 0;
      individualShakeArray[i * 3] = 0;
      individualShakeArray[i * 3 + 1] = 0;
      individualShakeArray[i * 3 + 2] = 0;
      kickDecayArray[i] = 1.0;
    }

    // Create prefab geometry (sphere)
    const prefabGeometry = new THREE.SphereGeometry(2, 4, 4);

    // Extract vertices and indices from the BufferGeometry
    const prefabPositions = prefabGeometry.attributes.position;
    const prefabNormals = prefabGeometry.attributes.normal;
    const prefabIndices = prefabGeometry.index;

    const verticesPerPrefab = prefabPositions.count;
    const indicesPerPrefab = prefabIndices ? prefabIndices.count : 0;

    const totalVertices = particleCount * verticesPerPrefab;
    const totalIndices = particleCount * indicesPerPrefab;

    // Create buffer geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(totalVertices * 3);
    const colors = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);
    const delayDurations = new Float32Array(totalVertices * 2);
    const pivots = new Float32Array(totalVertices * 3);
    const axisAngles = new Float32Array(totalVertices * 4);
    const indices = new Uint32Array(totalIndices);

    // Initialize attributes
    for (let i = 0; i < particleCount; i++) {
      const delay = i * prefabDelay;
      const duration =
        minDuration + Math.random() * (maxDuration - minDuration);

      // Random pivot (matching original range 0-2)
      const pivot = new THREE.Vector3(
        Math.random() * 2,
        Math.random() * 2,
        Math.random() * 2,
      );

      // Random axis and angle
      const axis = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ).normalize();
      const angle = Math.PI * (12 + Math.random() * 12);

      // Copy prefab vertices
      for (let j = 0; j < verticesPerPrefab; j++) {
        const vertexIndex = i * verticesPerPrefab + j;

        // Copy positions
        positions[vertexIndex * 3] = prefabPositions.getX(j);
        positions[vertexIndex * 3 + 1] = prefabPositions.getY(j);
        positions[vertexIndex * 3 + 2] = prefabPositions.getZ(j);

        // Copy normals
        normals[vertexIndex * 3] = prefabNormals.getX(j);
        normals[vertexIndex * 3 + 1] = prefabNormals.getY(j);
        normals[vertexIndex * 3 + 2] = prefabNormals.getZ(j);

        // Set colors
        colors[vertexIndex * 3] = PARTICLE_COLOR.r;
        colors[vertexIndex * 3 + 1] = PARTICLE_COLOR.g;
        colors[vertexIndex * 3 + 2] = PARTICLE_COLOR.b;

        // Set animation attributes
        delayDurations[vertexIndex * 2] = delay + j * vertexDelay;
        delayDurations[vertexIndex * 2 + 1] = duration;

        pivots[vertexIndex * 3] = pivot.x;
        pivots[vertexIndex * 3 + 1] = pivot.y;
        pivots[vertexIndex * 3 + 2] = pivot.z;

        axisAngles[vertexIndex * 4] = axis.x;
        axisAngles[vertexIndex * 4 + 1] = axis.y;
        axisAngles[vertexIndex * 4 + 2] = axis.z;
        axisAngles[vertexIndex * 4 + 3] = angle;
      }

      // Copy indices
      if (prefabIndices) {
        for (let j = 0; j < indicesPerPrefab; j++) {
          indices[i * indicesPerPrefab + j] =
            prefabIndices.getX(j) + i * verticesPerPrefab;
        }
      }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute(
      "aDelayDuration",
      new THREE.BufferAttribute(delayDurations, 2),
    );
    geometry.setAttribute("aPivot", new THREE.BufferAttribute(pivots, 3));
    geometry.setAttribute(
      "aAxisAngle",
      new THREE.BufferAttribute(axisAngles, 4),
    );
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Updated vertex shader with shake, rotation, and pan support
    const vertexShader = `
      #define PATH_LENGTH ${pathLength}
      
      uniform float uTime;
      uniform vec3 uPath[PATH_LENGTH];
      uniform float uRadius[PATH_LENGTH];
      uniform vec3 uShake[PATH_LENGTH];
      uniform float uRotation[PATH_LENGTH];
      uniform float uPan[PATH_LENGTH];
      uniform vec2 uRoundness;
      uniform float uParticleScale;
      uniform float uSubBassAvg;
      uniform vec3 uIndividualShake[PATH_LENGTH]; // NEW
      uniform float uKickDecay[PATH_LENGTH];      // NEW
      
      attribute vec2 aDelayDuration;
      attribute vec3 aPivot;
      attribute vec4 aAxisAngle;
      
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      
      vec3 rotateVector(vec4 q, vec3 v) {
        return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
      }
      
      vec4 quatFromAxisAngle(vec3 axis, float angle) {
        float halfAngle = angle * 0.5;
        return vec4(axis.xyz * sin(halfAngle), cos(halfAngle));
      }
      
      float catmullRom(float p0, float p1, float p2, float p3, float t) {
        float v0 = (p2 - p0) * 0.5;
        float v1 = (p3 - p1) * 0.5;
        float t2 = t * t;
        float t3 = t * t * t;
        return (2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1;
      }
      
      vec3 catmullRom(vec3 p0, vec3 p1, vec3 p2, vec3 p3, vec2 c, float t) {
        vec3 v0 = (p2 - p0) * c.x;
        vec3 v1 = (p3 - p1) * c.y;
        float t2 = t * t;
        float t3 = t * t * t;
        return vec3((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);
      }
      
      vec3 catmullRomShake(vec3 s0, vec3 s1, vec3 s2, vec3 s3, float t) {
        return vec3(
          catmullRom(s0.x, s1.x, s2.x, s3.x, t),
          catmullRom(s0.y, s1.y, s2.y, s3.y, t),
          catmullRom(s0.z, s1.z, s2.z, s3.z, t)
        );
      }
      
      void main() {
        vColor = color;
        
        float tDelay = aDelayDuration.x;
        float tDuration = aDelayDuration.y;
        float tTime = clamp(uTime - tDelay, 0.0, tDuration);
        float tProgress = tTime / tDuration;
        float angle = aAxisAngle.w * tProgress;
        vec4 tQuat = quatFromAxisAngle(aAxisAngle.xyz, angle);
        
        // Transform normal
        vec3 objectNormal = normal;
        objectNormal = rotateVector(tQuat, objectNormal);
        
        // Transform position
        vec3 transformed = position;
        float tMax = float(PATH_LENGTH - 1);
        float tPoint = tMax * tProgress;
        float tIndex = floor(tPoint);
        float tWeight = tPoint - tIndex;
        
        int i0 = int(max(0.0, tIndex - 1.0));
        int i1 = int(tIndex);
        int i2 = int(min(tIndex + 1.0, tMax));
        int i3 = int(min(tIndex + 2.0, tMax));
        
        vec3 p0 = uPath[i0];
        vec3 p1 = uPath[i1];
        vec3 p2 = uPath[i2];
        vec3 p3 = uPath[i3];
        
        // Interpolate shake
        vec3 s0 = uShake[i0];
        vec3 s1 = uShake[i1];
        vec3 s2 = uShake[i2];
        vec3 s3 = uShake[i3];
        vec3 shake = catmullRomShake(s0, s1, s2, s3, tWeight);
        
        // Interpolate rotation
        float rotation = catmullRom(uRotation[i0], uRotation[i1], uRotation[i2], uRotation[i3], tWeight);
        
        // Interpolate pan
        float pan = catmullRom(uPan[i0], uPan[i1], uPan[i2], uPan[i3], tWeight);
        
        // Apply pan to radius based on pivot position
        float radius = catmullRom(uRadius[i0], uRadius[i1], uRadius[i2], uRadius[i3], tWeight);
        
        // Pan affects particles based on their angular position around the spine
        float particleAngle = atan(aPivot.z, aPivot.x);
        float panEffect = 1.0 + pan * cos(particleAngle) * 0.5; // Pan affects left/right differently
        radius *= panEffect;
        
        transformed += aPivot * radius;
        
        // Apply rotation around Y axis for spine rotation
        if (abs(rotation) > 0.01) {
          mat3 rotMat = mat3(
            cos(rotation), 0.0, sin(rotation),
            0.0, 1.0, 0.0,
            -sin(rotation), 0.0, cos(rotation)
          );
          transformed = rotMat * transformed;
        }
        
        transformed = rotateVector(tQuat, transformed);
        transformed *= uParticleScale;
        
        // Individual particle shake for sub-bass (erratic, random per particle)
        float subBassFactor = 1.0 - smoothstep(0.0, 0.1, tProgress); // Assuming sub-bass is first 10% of progress
        float individualShakeAmp = uSubBassAvg * subBassFactor * 8.0; // Adjust amplitude here
        vec3 individualShake = vec3(
          sin(uTime * 10.0 + aPivot.x * 31.4 + aPivot.y * 17.2),
          sin(uTime * 11.0 + aPivot.y * 29.3 + aPivot.z * 13.7),
          sin(uTime * 12.0 + aPivot.z * 23.6 + aPivot.x * 19.8)
        ) * individualShakeAmp;
        transformed += individualShake;

        // NEW: Apply individual particle shake based on pivot
        float individualShakeAmount = uIndividualShake[pathIndex].x * aPivot.x + 
                                      uIndividualShake[pathIndex].y * aPivot.y + 
                                      uIndividualShake[pathIndex].z * aPivot.z;
        transformed += individualShakeAmount * 2.0;
        
        // NEW: Apply kick decay
        transformed *= uKickDecay[pathIndex];
        
        // Add base position and shake
        vec3 basePosition = catmullRom(p0, p1, p2, p3, uRoundness, tWeight);
        transformed += basePosition + shake;
        
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        vNormal = normalize(normalMatrix * objectNormal);
        vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      }
    `;

    // Fragment shader (same as original)
    const fragmentShader = `
      uniform vec3 uEmissive;
      uniform vec3 uLightPos1;
      uniform vec3 uLightPos2;
      uniform vec3 uLightPos3;
      uniform vec3 uLightColor1;
      uniform vec3 uLightColor2;
      uniform vec3 uLightColor3;
      uniform float uLightIntensity1;
      uniform float uLightIntensity2;
      uniform float uLightIntensity3;
      
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 finalColor = uEmissive * vColor;
        
        // Light 1 (point light)
        vec3 lightDir1 = normalize(uLightPos1 - vWorldPosition);
        float diff1 = max(dot(normal, lightDir1), 0.0);
        float distance1 = length(uLightPos1 - vWorldPosition);
        float attenuation1 = 1.0 / (1.0 + 0.001 * distance1 + 0.0001 * distance1 * distance1);
        finalColor += vColor * uLightColor1 * diff1 * uLightIntensity1 * attenuation1;
        
        // Light 2 (directional)
        vec3 lightDir2 = normalize(uLightPos2);
        float diff2 = max(dot(normal, lightDir2), 0.0);
        finalColor += vColor * uLightColor2 * diff2 * uLightIntensity2;
        
        // Light 3 (directional)
        vec3 lightDir3 = normalize(uLightPos3);
        float diff3 = max(dot(normal, lightDir3), 0.0);
        finalColor += vColor * uLightColor3 * diff3 * uLightIntensity3;
        
        // Add ambient
        finalColor += vColor * 0.1;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    // Create material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPath: { value: pathPositions },
        uRadius: { value: radiusArray },
        uShake: { value: shakeArray },
        uRotation: { value: rotationArray },
        uPan: { value: panArray },
        uRoundness: { value: new THREE.Vector2(2, 2) },
        uParticleScale: { value: 1.0 },
        uSubBassAvg: { value: 0.0 },
        uEmissive: {
          value: new THREE.Color(
            PARTICLE_COLOR.emissive.r,
            PARTICLE_COLOR.emissive.g,
            PARTICLE_COLOR.emissive.b,
          ),
        },
        uLightPos1: { value: new THREE.Vector3(0, 0, 0) },
        uLightPos2: { value: new THREE.Vector3(0, 1, 1) },
        uLightPos3: { value: new THREE.Vector3(0, 1, -1) },
        uLightColor1: {
          value: new THREE.Color(
            PARTICLE_COLOR.lights.color1.r,
            PARTICLE_COLOR.lights.color1.g,
            PARTICLE_COLOR.lights.color1.b,
          ),
        },
        uLightColor2: {
          value: new THREE.Color(
            PARTICLE_COLOR.lights.color2.r,
            PARTICLE_COLOR.lights.color2.g,
            PARTICLE_COLOR.lights.color2.b,
          ),
        },
        uLightColor3: {
          value: new THREE.Color(
            PARTICLE_COLOR.lights.color3.r,
            PARTICLE_COLOR.lights.color3.g,
            PARTICLE_COLOR.lights.color3.b,
          ),
        },
        uLightIntensity1: { value: 0.25 },
        uLightIntensity2: { value: 0.25 },
        uLightIntensity3: { value: 0.25 },
      },
      vertexShader,
      fragmentShader,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    const particles = new THREE.Mesh(geometry, material);
    particles.frustumCulled = false;
    scene.add(particles);

    // Store references
    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      particles,
      pathPositions,
      radiusArray,
      shakeArray,
      rotationArray,
      panArray,
      lights: { light1, light2, light3 },
      analyzer: undefined,
    };

    setDebugInfo("Ready to play");
    console.log("Particle system ready");

    // Animation loop
    let frameCount = 0;
    const animate = () => {
      frameId.current = requestAnimationFrame(animate);
      frameCount++;

      if (!sceneRef.current) return;

      const {
        camera,
        renderer,
        scene,
        controls,
        particles,
        radiusArray,
        shakeArray,
        rotationArray,
        panArray,
      } = sceneRef.current;
      const anim = animState.current;

      controls.update();

      // Update time
      anim.time = audioRef.current?.currentTime || 0;
      if (particles.material && particles.material.uniforms) {
        particles.material.uniforms.uTime.value = anim.time;
      }

      // Update shake phase for erratic movement
      anim.shakePhase += 0.3;
      anim.rotationPhase += 0.02;

      // Audio processing
      if (
        sceneRef.current.analyzer &&
        isPlayingRef.current &&
        audioRef.current &&
        !audioRef.current.paused
      ) {
        sceneRef.current.analyzer.updateSample();
        const data = sceneRef.current.analyzer.frequencyByteData;
        const dataLeft = sceneRef.current.analyzer.frequencyByteDataLeft;
        const dataRight = sceneRef.current.analyzer.frequencyByteDataRight;
        const dataArray: number[] = [];
        const cap = data.length * 0.5;

        anim.noiseOffset += 0.01;

        // Calculate frequency bands for 5 sections
        const sampleRate = 44100;
        const binHz = sampleRate / (sceneRef.current.analyzer.binCount * 2);

        // Frequency boundaries
        const subBassEnd = Math.floor(60 / binHz); // 20-60 Hz
        const lowBassEnd = Math.floor(250 / binHz); // 60-250 Hz
        const lowMidEnd = Math.floor(500 / binHz); // 250-500 Hz
        const highMidEnd = Math.floor(2000 / binHz); // 500-2000 Hz
        // Everything above 2000 Hz is highs

        // Calculate averages for each band with full stereo analysis
        let subBassTotal = 0,
          lowBassTotal = 0,
          lowMidTotal = 0,
          highMidTotal = 0,
          highTotal = 0;
        let subBassLeft = 0,
          subBassRight = 0;
        let lowBassLeft = 0,
          lowBassRight = 0;
        let lowMidLeft = 0,
          lowMidRight = 0;
        let highMidLeft = 0,
          highMidRight = 0;
        let highLeft = 0,
          highRight = 0;

        // Sub-bass with stereo analysis
        for (let i = 0; i < subBassEnd; i++) {
          subBassTotal += data[i];
          subBassLeft += dataLeft[i];
          subBassRight += dataRight[i];
        }
        let rawSubBassAvg =
          (subBassTotal / Math.max(1, subBassEnd) / 255) *
          BASS_CONFIG.subBassIntensity;
        let subBassLeftAvg = subBassLeft / Math.max(1, subBassEnd) / 255;
        let subBassRightAvg = subBassRight / Math.max(1, subBassEnd) / 255;

        // Envelope for sub-bass: fast attack, conditional decay, transient boost
        let subBassDelta = rawSubBassAvg - anim.previousSubBassAvg;
        if (subBassDelta > 0.05) {
          // Onset detection for transient boost
          anim.smoothedSubBassAvg += subBassDelta * 2.0;
          anim.smoothedSubBassAvg = Math.min(1.5, anim.smoothedSubBassAvg);
        }
        if (rawSubBassAvg > anim.smoothedSubBassAvg) {
          anim.smoothedSubBassAvg = rawSubBassAvg; // Fast attack
        } else {
          let decayRate = anim.smoothedSubBassAvg > 0.8 ? 0.1 : 0.5; // Slow decay if high, fast if low
          anim.smoothedSubBassAvg =
            anim.smoothedSubBassAvg * (1 - decayRate) +
            rawSubBassAvg * decayRate;
        }
        let subBassAvg = anim.smoothedSubBassAvg;
        anim.previousSubBassAvg = rawSubBassAvg;

        // Low bass with stereo
        for (let i = subBassEnd; i < lowBassEnd; i++) {
          lowBassTotal += data[i];
          lowBassLeft += dataLeft[i];
          lowBassRight += dataRight[i];
        }
        let rawLowBassAvg =
          (lowBassTotal / Math.max(1, lowBassEnd - subBassEnd) / 255) *
          BASS_CONFIG.lowBassIntensity;
        let lowBassLeftAvg =
          lowBassLeft / Math.max(1, lowBassEnd - subBassEnd) / 255;
        let lowBassRightAvg =
          lowBassRight / Math.max(1, lowBassEnd - subBassEnd) / 255;

        // Envelope for low-bass: similar to sub-bass for better reaction
        let lowBassDelta = rawLowBassAvg - anim.previousLowBassAvg;
        if (lowBassDelta > 0.05) {
          anim.smoothedLowBassAvg += lowBassDelta * 1.5;
          anim.smoothedLowBassAvg = Math.min(1.5, anim.smoothedLowBassAvg);
        }
        if (rawLowBassAvg > anim.smoothedLowBassAvg) {
          anim.smoothedLowBassAvg = rawLowBassAvg;
        } else {
          let decayRate = anim.smoothedLowBassAvg > 0.8 ? 0.1 : 0.5;
          anim.smoothedLowBassAvg =
            anim.smoothedLowBassAvg * (1 - decayRate) +
            rawLowBassAvg * decayRate;
        }
        let lowBassAvg = anim.smoothedLowBassAvg;
        anim.previousLowBassAvg = rawLowBassAvg;

        // Low mids with stereo
        for (let i = lowBassEnd; i < lowMidEnd; i++) {
          lowMidTotal += data[i];
          lowMidLeft += dataLeft[i];
          lowMidRight += dataRight[i];
        }
        let lowMidAvg =
          (lowMidTotal / Math.max(1, lowMidEnd - lowBassEnd) / 255) *
          BASS_CONFIG.lowMidIntensity;
        let lowMidLeftAvg =
          lowMidLeft / Math.max(1, lowMidEnd - lowBassEnd) / 255;
        let lowMidRightAvg =
          lowMidRight / Math.max(1, lowMidEnd - lowBassEnd) / 255;

        // High mids with stereo
        for (let i = lowMidEnd; i < highMidEnd; i++) {
          highMidTotal += data[i];
          highMidLeft += dataLeft[i];
          highMidRight += dataRight[i];
        }
        let highMidAvg =
          (highMidTotal / Math.max(1, highMidEnd - lowMidEnd) / 255) *
          BASS_CONFIG.highMidIntensity;
        let highMidLeftAvg =
          highMidLeft / Math.max(1, highMidEnd - lowMidEnd) / 255;
        let highMidRightAvg =
          highMidRight / Math.max(1, highMidEnd - lowMidEnd) / 255;

        // Highs with stereo
        for (let i = highMidEnd; i < cap; i++) {
          highTotal += data[i];
          highLeft += dataLeft[i];
          highRight += dataRight[i];
        }
        let highAvg =
          (highTotal / Math.max(1, cap - highMidEnd) / 255) *
          BASS_CONFIG.highIntensity;
        let highLeftAvg = highLeft / Math.max(1, cap - highMidEnd) / 255;
        let highRightAvg = highRight / Math.max(1, cap - highMidEnd) / 255;

        // Calculate stereo pan for each band (-1 = left, 0 = center, 1 = right)
        const calculatePan = (left: number, right: number) => {
          if (left + right > 0.01) {
            return (right - left) / (left + right);
          }
          return 0;
        };

        let subBassPan = calculatePan(subBassLeftAvg, subBassRightAvg);
        let lowBassPan = calculatePan(lowBassLeftAvg, lowBassRightAvg);
        let lowMidPan = calculatePan(lowMidLeftAvg, lowMidRightAvg);
        let highMidPan = calculatePan(highMidLeftAvg, highMidRightAvg);
        let highPan = calculatePan(highLeftAvg, highRightAvg);

        // Add noise to frequency averages
        subBassAvg +=
          Math.sin(anim.noiseOffset * 2.3 + anim.randomSeed) *
          0.05 *
          subBassAvg;
        lowBassAvg +=
          Math.sin(anim.noiseOffset * 1.9 + anim.randomSeed * 1.1) *
          0.05 *
          lowBassAvg;
        lowMidAvg +=
          Math.sin(anim.noiseOffset * 1.7 + anim.randomSeed * 2) *
          0.05 *
          lowMidAvg;
        highMidAvg +=
          Math.sin(anim.noiseOffset * 2.1 + anim.randomSeed * 2.5) *
          0.05 *
          highMidAvg;
        highAvg +=
          Math.sin(anim.noiseOffset * 3.1 + anim.randomSeed * 3) *
          0.05 *
          highAvg;

        // Bass hit detection for sub-bass
        const bassHit = subBassAvg > 0.6 && anim.previousBassAvg < 0.5;
        if (bassHit) {
          anim.bassHitTime = Date.now();
        }
        anim.previousBassAvg = subBassAvg;

        // Complex radius calculation - THIS IS THE KEY PART
        const currentTime = audioRef.current.currentTime || 0;
        const prefabDelay = 0.00015;
        let minVisibleProgress = 1.0;
        let maxVisibleProgress = 0.0;
        let avgDuration = 170;
        avgDuration += Math.sin(anim.noiseOffset * 0.5) * 10;

        // Calculate visible range
        for (let i = 0; i < cap; i++) {
          const segmentDelay = i * prefabDelay;
          const timeInPath = currentTime - segmentDelay;
          const progressAlongPath = Math.min(
            1.0,
            Math.max(0.0, timeInPath / avgDuration),
          );

          if (timeInPath > 0 && timeInPath < avgDuration) {
            minVisibleProgress = Math.min(
              minVisibleProgress,
              progressAlongPath,
            );
            maxVisibleProgress = Math.max(
              maxVisibleProgress,
              progressAlongPath,
            );
          }
        }

        if (maxVisibleProgress <= minVisibleProgress) {
          minVisibleProgress = 0.0;
          maxVisibleProgress = 0.5; // Show more range for 5 sections
        }

        const visibleRange = maxVisibleProgress - minVisibleProgress;

        // Adjusted section portions: sub-bass 10%, regular bass 30%, remaining 60% split evenly (20% each)
        const subBassPortion = 0.1;
        const lowBassPortion = 0.3;
        const otherPortion = 0.2; // For lowMid, highMid, high

        // Calculate thresholds for 5 sections with adjusted sizes
        const subBassThreshold =
          minVisibleProgress + visibleRange * subBassPortion;
        const lowBassThreshold =
          subBassThreshold + visibleRange * lowBassPortion;
        const lowMidThreshold = lowBassThreshold + visibleRange * otherPortion;
        const highMidThreshold = lowMidThreshold + visibleRange * otherPortion;

        // Clear arrays
        for (let i = 0; i < pathLength; i++) {
          shakeArray[i * 3] = 0;
          shakeArray[i * 3 + 1] = 0;
          shakeArray[i * 3 + 2] = 0;
          rotationArray[i] = 0;
          panArray[i] = 0;
        }

        // Process frequency data for all segments (ORIGINAL LOGIC)
        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < cap; i++) {
            let idx = i;
            if (pass === 1) idx = cap - 1 - i;

            const segmentDelay = (pass < 2 ? i : i + cap) * prefabDelay;
            const timeInPath = currentTime - segmentDelay;
            const progressAlongPath = Math.min(
              1.0,
              Math.max(0.0, timeInPath / avgDuration),
            );

            let weight = 1.0;
            let freqValue = 0;
            let isInSubBassSection = false;
            let currentFreqAvg = 0;

            // Determine which frequency section this particle is in
            if (progressAlongPath <= subBassThreshold || timeInPath <= 0) {
              // Sub-bass section
              isInSubBassSection = true;
              currentFreqAvg = subBassAvg;
              weight = 1.8 + subBassAvg * 4.0;
              weight += (Math.random() - 0.5) * 0.3;
              if (idx < subBassEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = subBassAvg * 255 * weight * 0.6;
              }
              if (bassHit && Math.random() > 0.7) {
                freqValue *= 1.3 + Math.random() * 0.4;
              }
            } else if (progressAlongPath < lowBassThreshold) {
              // Low bass section
              currentFreqAvg = lowBassAvg;
              weight = 1.5 + lowBassAvg * 3.0;
              weight += (Math.random() - 0.5) * 0.25;
              if (idx >= subBassEnd && idx < lowBassEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = lowBassAvg * 255 * weight * 0.65;
              }
            } else if (progressAlongPath < lowMidThreshold) {
              // Low mid section
              currentFreqAvg = lowMidAvg;
              weight = 1.2 + lowMidAvg * 2.0;
              weight += (Math.random() - 0.5) * 0.2;
              if (idx >= lowBassEnd && idx < lowMidEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = lowMidAvg * 255 * weight * 0.7;
              }
            } else if (progressAlongPath < highMidThreshold) {
              // High mid section
              currentFreqAvg = highMidAvg;
              weight = 1.0 + highMidAvg * 1.5;
              weight += (Math.random() - 0.5) * 0.15;
              if (idx >= lowMidEnd && idx < highMidEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = highMidAvg * 255 * weight * 0.75;
              }
            } else {
              // High section
              currentFreqAvg = highAvg;
              weight = 1.0 + highAvg * 1.5;
              weight += (Math.random() - 0.5) * 0.15;
              if (idx >= highMidEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = highAvg * 255 * weight * 0.8;
              }
            }

            if (pass >= 2) {
              freqValue *= 0.7;
            }

            dataArray.push(freqValue);

            // Apply effects based on section
            if (i < pathLength) {
              const pathIndex = Math.floor(
                progressAlongPath * (pathLength - 1),
              );
              if (pathIndex >= 0 && pathIndex < pathLength) {
                // Sub-bass section: shake, rotation, and pan
                if (isInSubBassSection && subBassAvg > 0.1) {
                  // Erratic shake
                  const shakeIntensity =
                    subBassAvg * BASS_CONFIG.subBassShakeIntensity;
                  const shake1 = Math.sin(
                    anim.shakePhase * 7.3 + pathIndex * 0.5,
                  );
                  const shake2 = Math.sin(
                    anim.shakePhase * 13.7 + pathIndex * 0.7,
                  );
                  const shake3 = Math.sin(
                    anim.shakePhase * 23.1 + pathIndex * 1.1,
                  );

                  shakeArray[pathIndex * 3] +=
                    shake1 * shakeIntensity * (Math.random() - 0.5);
                  shakeArray[pathIndex * 3 + 1] +=
                    shake2 * shakeIntensity * (Math.random() - 0.5);
                  shakeArray[pathIndex * 3 + 2] +=
                    shake3 * shakeIntensity * (Math.random() - 0.5);

                  // Spine rotation
                  rotationArray[pathIndex] =
                    Math.sin(anim.rotationPhase + pathIndex * 0.1) *
                    subBassAvg *
                    BASS_CONFIG.subBassRotationIntensity;

                  // Stereo pan for sub-bass
                  panArray[pathIndex] = subBassPan * subBassAvg;

                  // Extra effects on bass hit
                  if (bassHit) {
                    shakeArray[pathIndex * 3] *= 1.5;
                    shakeArray[pathIndex * 3 + 1] *= 1.5;
                    shakeArray[pathIndex * 3 + 2] *= 1.5;
                    rotationArray[pathIndex] *= 2.0;
                  }
                } else if (progressAlongPath < lowBassThreshold) {
                  // Low bass section - pan only
                  panArray[pathIndex] = lowBassPan * lowBassAvg;
                } else if (progressAlongPath < lowMidThreshold) {
                  // Low mid section - pan only
                  panArray[pathIndex] = lowMidPan * lowMidAvg;
                } else if (progressAlongPath < highMidThreshold) {
                  // High mid section - pan only
                  panArray[pathIndex] = highMidPan * highMidAvg;
                } else {
                  // High section - pan only
                  panArray[pathIndex] = highPan * highAvg;
                }
              }
            }
          }
        }

        // Update radius array based on processed data
        for (let i = 0; i < pathLength; i++) {
          // Make sure we have data for this index
          if (i < dataArray.length) {
            let val = dataArray[i] / 255;
            val += Math.sin(anim.noiseOffset * 4 + i * 0.2) * 0.02;
            val = Math.max(0, Math.min(1, val));

            let baseRadius =
              Math.pow(val, BASS_CONFIG.radiusPower) *
              BASS_CONFIG.radiusMultiplier;
            baseRadius += (Math.random() - 0.5) * 2;

            // Calculate which section this path point belongs to
            const pathProgress = i / (pathLength - 1);

            // Extra boost for sub-bass section (first 10% of visible particles)
            if (pathProgress <= subBassPortion) {
              baseRadius += subBassAvg * subBassAvg * 120;
              if (bassHit && Math.random() > 0.6) {
                baseRadius *= 1.2 + Math.random() * 0.3;
              }
            }

            radiusArray[i] = Math.max(1, baseRadius);
          } else {
            // For any remaining path points, use the frequency section averages
            const pathProgress = i / (pathLength - 1);
            let sectionAvg = 0;

            if (pathProgress <= subBassPortion) {
              sectionAvg = subBassAvg;
            } else if (pathProgress <= subBassPortion + lowBassPortion) {
              sectionAvg = lowBassAvg;
            } else if (
              pathProgress <=
              subBassPortion + lowBassPortion + otherPortion
            ) {
              sectionAvg = lowMidAvg;
            } else if (
              pathProgress <=
              subBassPortion + lowBassPortion + otherPortion * 2
            ) {
              sectionAvg = highMidAvg;
            } else {
              sectionAvg = highAvg;
            }

            let baseRadius =
              Math.pow(sectionAvg, BASS_CONFIG.radiusPower) *
              BASS_CONFIG.radiusMultiplier;
            baseRadius += (Math.random() - 0.5) * 2;

            radiusArray[i] = Math.max(10, baseRadius);
          }
        }

        // Update material uniforms
        if (particles.material && particles.material.uniforms) {
          // Roundness (affected by sub-bass)
          const r =
            BASS_CONFIG.roundnessMultiplier * Math.pow(subBassAvg, 2) + 1;
          particles.material.uniforms.uRoundness.value.set(
            r + Math.sin(anim.noiseOffset * 3) * 0.5,
            r + Math.sin(anim.noiseOffset * 3) * 0.5,
          );

          // Particle scale
          const bassParticleScale =
            1.0 + subBassAvg * (BASS_CONFIG.particleScaleMax - 1.0) * 1.5;
          const overallEnergy =
            subBassAvg * 0.3 +
            lowBassAvg * 0.2 +
            lowMidAvg * 0.2 +
            highMidAvg * 0.15 +
            highAvg * 0.15;
          let particleScale =
            1.0 + overallEnergy * (BASS_CONFIG.particleScaleMax - 1.0);
          particleScale = Math.max(particleScale, bassParticleScale);
          particleScale +=
            Math.sin(anim.noiseOffset * 5 + anim.randomSeed) * 0.05;

          particles.material.uniforms.uParticleScale.value = particleScale;
          particles.material.uniforms.uSubBassAvg.value = subBassAvg;
          particles.material.uniforms.uRadius.needsUpdate = true;
          particles.material.uniforms.uShake.needsUpdate = true;
          particles.material.uniforms.uRotation.needsUpdate = true;
          particles.material.uniforms.uPan.needsUpdate = true;
        }

        // Force update uniforms
        if (particles.material && particles.material.uniforms) {
          particles.material.uniforms.uRadius.value = radiusArray;
          particles.material.uniforms.uShake.value = shakeArray;
          particles.material.uniforms.uRotation.value = rotationArray;
          particles.material.uniforms.uPan.value = panArray;
          particles.material.uniforms.uRadius.needsUpdate = true;
          particles.material.uniforms.uShake.needsUpdate = true;
          particles.material.uniforms.uRotation.needsUpdate = true;
          particles.material.uniforms.uPan.needsUpdate = true;
        }

        // Update lights based on sub-bass
        const { lights } = sceneRef.current;
        const lightIntensity =
          subBassAvg * BASS_CONFIG.lightIntensityMultiplier;
        const flicker = bassHit
          ? 0.8 + Math.random() * 0.4
          : 0.9 + Math.random() * 0.1;

        lights.light1.intensity = Math.pow(lightIntensity, 2) * flicker;
        lights.light2.intensity =
          Math.pow(lightIntensity, 3) * 0.5 * (0.9 + Math.random() * 0.1);
        lights.light3.intensity =
          Math.pow(lightIntensity, 3) * 0.5 * (0.9 + Math.random() * 0.1);

        // Update material light uniforms
        if (particles.material && particles.material.uniforms) {
          particles.material.uniforms.uLightIntensity1.value =
            lights.light1.intensity;
          particles.material.uniforms.uLightIntensity2.value =
            lights.light2.intensity;
          particles.material.uniforms.uLightIntensity3.value =
            lights.light3.intensity;

          // Color shift based on sub-bass
          if (BASS_CONFIG.enableColorShift && subBassAvg > 0.5) {
            const hueShift = Math.sin(anim.noiseOffset * 2) * 0.05;
            lights.light1.color.setHSL(
              0.0 + hueShift,
              1.0,
              0.5 + subBassAvg * 0.5,
            );
            lights.light2.color.setHSL(
              0.1 + hueShift * 0.5,
              0.8,
              0.5 + subBassAvg * 0.3,
            );
            lights.light3.color.setHSL(
              0.05 + hueShift * 0.7,
              0.9,
              0.5 + subBassAvg * 0.4,
            );

            particles.material.uniforms.uLightColor1.value.copy(
              lights.light1.color,
            );
            particles.material.uniforms.uLightColor2.value.copy(
              lights.light2.color,
            );
            particles.material.uniforms.uLightColor3.value.copy(
              lights.light3.color,
            );
          } else {
            // Reset to original colors
            lights.light1.color.setRGB(
              PARTICLE_COLOR.lights.color1.r,
              PARTICLE_COLOR.lights.color1.g,
              PARTICLE_COLOR.lights.color1.b,
            );
            lights.light2.color.setRGB(
              PARTICLE_COLOR.lights.color2.r,
              PARTICLE_COLOR.lights.color2.g,
              PARTICLE_COLOR.lights.color2.b,
            );
            lights.light3.color.setRGB(
              PARTICLE_COLOR.lights.color3.r,
              PARTICLE_COLOR.lights.color3.g,
              PARTICLE_COLOR.lights.color3.b,
            );

            particles.material.uniforms.uLightColor1.value.set(
              PARTICLE_COLOR.lights.color1.r,
              PARTICLE_COLOR.lights.color1.g,
              PARTICLE_COLOR.lights.color1.b,
            );
            particles.material.uniforms.uLightColor2.value.set(
              PARTICLE_COLOR.lights.color2.r,
              PARTICLE_COLOR.lights.color2.g,
              PARTICLE_COLOR.lights.color2.b,
            );
            particles.material.uniforms.uLightColor3.value.set(
              PARTICLE_COLOR.lights.color3.r,
              PARTICLE_COLOR.lights.color3.g,
              PARTICLE_COLOR.lights.color3.b,
            );
          }
        }

        // Update rotation speed based on sub-bass
        let rotSpeed = 2.0 + subBassAvg * BASS_CONFIG.rotationSpeedMax;
        rotSpeed += Math.sin(anim.noiseOffset * 0.7) * 0.5;
        if (Date.now() - anim.bassHitTime < 500) {
          rotSpeed += (Math.random() - 0.5) * 3;
        }
        controls.autoRotateSpeed = rotSpeed;

        if (frameCount % 30 === 0) {
          setDebugInfo(
            `Sub: ${(subBassAvg * 100).toFixed(0)}% | Low: ${(lowBassAvg * 100).toFixed(0)}% | LMid: ${(lowMidAvg * 100).toFixed(0)}% | HMid: ${(highMidAvg * 100).toFixed(0)}% | High: ${(highAvg * 100).toFixed(0)}% | Pan: ${subBassPan.toFixed(2)}`,
          );
        }
      } else {
        // Default animation when not playing
        for (let i = 0; i < pathLength; i++) {
          radiusArray[i] = 0;
          shakeArray[i * 3] = 0;
          shakeArray[i * 3 + 1] = 0;
          shakeArray[i * 3 + 2] = 0;
          rotationArray[i] = 0;
          panArray[i] = 0;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!sceneRef.current) return;
      const { camera, renderer } = sceneRef.current;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
      controls.dispose();
      if (sceneRef.current) {
        sceneRef.current.renderer.dispose();
      }
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handlePlay = async () => {
    console.log("handlePlay called");
    if (!audioRef.current || !sceneRef.current) {
      console.log("Missing refs:", {
        audio: !!audioRef.current,
        scene: !!sceneRef.current,
      });
      return;
    }

    setDebugInfo("Initializing audio...");

    try {
      if (!sceneRef.current.analyzer) {
        console.log("Creating analyzer...");
        sceneRef.current.analyzer = new AudioAnalyzer(pathLength * 4, 0.85);
      }

      console.log("Initializing analyzer...");
      const success = await sceneRef.current.analyzer.init(audioRef.current);
      if (!success) {
        setDebugInfo("Failed to initialize audio");
        return;
      }

      // Ensure audio context is resumed
      if (sceneRef.current.analyzer.context.state === "suspended") {
        await sceneRef.current.analyzer.context.resume();
        console.log("Audio context resumed");
      }

      audioRef.current.currentTime = 0;
      console.log("About to play audio...");
      await audioRef.current.play();
      console.log("Audio play() called successfully");

      setIsPlaying(true);
      isPlayingRef.current = true;
      setShowPlayButton(false);
      setDebugInfo("Playing...");
      console.log("State updated: isPlaying = true, analyzer connected");

      if (sceneRef.current) {
        // Set camera far away initially like original
        sceneRef.current.camera.position.set(0, 0, 10000);
        sceneRef.current.controls.distance = 10000;
        sceneRef.current.controls.targetDistance = 1000;
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setDebugInfo(`Error: ${error}`);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div ref={containerRef} className="h-full w-full" />

      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        src={aud}
        onEnded={() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
          setShowPlayButton(true);
          setDebugInfo("Ready to play");
        }}
      />

      {showPlayButton && (
        <div className="bg-opacity-60 absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center">
            <button
              onClick={handlePlay}
              className="mb-4 rounded-lg bg-red-600 px-8 py-4 text-xl font-bold text-white shadow-lg transition-colors duration-200 hover:bg-red-700"
            >
              Play 100,000 Particles
            </button>
            <p className="text-sm text-white">
              Particles will flow along a path and react to music
            </p>
          </div>
        </div>
      )}

      <div className="bg-opacity-70 absolute bottom-4 left-4 rounded bg-black p-2 text-xs text-white">
        {debugInfo} | {particleCount.toLocaleString()} particles | Scroll to
        zoom
      </div>
    </div>
  );
};

export default AudioVisualizer;
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                     OLD                                    */
/* -------------------------------------------------------------------------- */

// // Particle color configuration - Easy to change!
// const PARTICLE_COLOR = {
//   // Main particle color (RGB values 0-1)
//   r: 1.0, // Red
//   g: 1.0, // Green
//   b: 1.0, // Blue

//   // Emissive glow color
//   emissive: {
//     r: 1.0,
//     g: 1.0,
//     b: 1.0,
//   },

//   // Light colors (set to white for natural lighting, or match particle color)
//   lights: {
//     color1: { r: 1, g: 1, b: 1 }, // White lighting
//     color2: { r: 1, g: 1, b: 1 },
//     color3: { r: 1, g: 1, b: 1 },
//   },
// };

// const aud = holdmedown_borne;

// // Camera Controller
// class CameraController {
//   camera: THREE.PerspectiveCamera;
//   domElement: HTMLElement;
//   autoRotate = true;
//   autoRotateSpeed = 0.1;
//   rotationY = 0;
//   targetDistance = 1200;
//   distance = 1200;
//   isDragging = false;
//   previousMouseX = 0;
//   previousMouseY = 0;
//   spherical = new THREE.Spherical();
//   minDistance = 50;
//   maxDistance = 1500;
//   minPolarAngle = Math.PI * 0.4;
//   maxPolarAngle = Math.PI * 0.6;

//   constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
//     this.camera = camera;
//     this.domElement = domElement;

//     this.distance = 1200;
//     this.targetDistance = 1200;
//     this.rotationY = 0;

//     this.domElement.addEventListener("wheel", this.onWheel.bind(this));
//     this.domElement.addEventListener("mousedown", this.onMouseDown.bind(this));
//     this.domElement.addEventListener("mousemove", this.onMouseMove.bind(this));
//     this.domElement.addEventListener("mouseup", this.onMouseUp.bind(this));
//     this.domElement.addEventListener("mouseleave", this.onMouseUp.bind(this));
//   }

//   onWheel(e: WheelEvent) {
//     e.preventDefault();
//     this.targetDistance += e.deltaY * 0.5;
//     this.targetDistance = Math.max(
//       this.minDistance,
//       Math.min(this.maxDistance, this.targetDistance),
//     );
//   }

//   onMouseDown(e: MouseEvent) {
//     this.isDragging = true;
//     this.previousMouseX = e.clientX;
//     this.previousMouseY = e.clientY;
//   }

//   onMouseMove(e: MouseEvent) {
//     if (!this.isDragging) return;

//     const deltaX = e.clientX - this.previousMouseX;
//     const deltaY = e.clientY - this.previousMouseY;

//     this.rotationY -= deltaX * 0.01;

//     this.previousMouseX = e.clientX;
//     this.previousMouseY = e.clientY;
//   }

//   onMouseUp() {
//     this.isDragging = false;
//   }

//   update() {
//     if (this.autoRotate && !this.isDragging) {
//       this.rotationY += this.autoRotateSpeed * 0.005;
//     }

//     this.distance += (this.targetDistance - this.distance) * 0.05;

//     this.camera.position.x = Math.sin(this.rotationY) * this.distance;
//     this.camera.position.z = Math.cos(this.rotationY) * this.distance;
//     this.camera.position.y = 0;
//     this.camera.lookAt(0, 0, 0);
//   }

//   dispose() {
//     this.domElement.removeEventListener("wheel", this.onWheel.bind(this));
//     this.domElement.removeEventListener(
//       "mousedown",
//       this.onMouseDown.bind(this),
//     );
//     this.domElement.removeEventListener(
//       "mousemove",
//       this.onMouseMove.bind(this),
//     );
//     this.domElement.removeEventListener("mouseup", this.onMouseUp.bind(this));
//     this.domElement.removeEventListener(
//       "mouseleave",
//       this.onMouseUp.bind(this),
//     );
//   }
// }

// // Audio Analyzer with Stereo Support
// class AudioAnalyzer {
//   context: AudioContext;
//   analyzerNode: AnalyserNode;
//   analyzerNodeLeft: AnalyserNode;
//   analyzerNodeRight: AnalyserNode;
//   splitter: ChannelSplitterNode;
//   merger: ChannelMergerNode;
//   source: MediaElementAudioSourceNode | null = null;
//   frequencyByteData: Uint8Array;
//   frequencyByteDataLeft: Uint8Array;
//   frequencyByteDataRight: Uint8Array;
//   timeByteData: Uint8Array;
//   binCount: number;
//   isConnected = false;

//   constructor(binCount: number = 1024, smoothingTimeConstant: number = 0.85) {
//     this.context = new (window.AudioContext ||
//       (window as any).webkitAudioContext)();

//     // Main analyzer for combined audio
//     this.analyzerNode = this.context.createAnalyser();

//     // Separate analyzers for left and right channels
//     this.analyzerNodeLeft = this.context.createAnalyser();
//     this.analyzerNodeRight = this.context.createAnalyser();

//     // Splitter and merger for stereo processing
//     this.splitter = this.context.createChannelSplitter(2);
//     this.merger = this.context.createChannelMerger(2);

//     this.binCount = binCount;
//     this.setBinCount(binCount);
//     this.setSmoothingTimeConstant(smoothingTimeConstant);
//   }

//   setBinCount(binCount: number) {
//     this.binCount = binCount;
//     this.analyzerNode.fftSize = binCount * 2;
//     this.analyzerNodeLeft.fftSize = binCount * 2;
//     this.analyzerNodeRight.fftSize = binCount * 2;
//     this.frequencyByteData = new Uint8Array(binCount);
//     this.frequencyByteDataLeft = new Uint8Array(binCount);
//     this.frequencyByteDataRight = new Uint8Array(binCount);
//     this.timeByteData = new Uint8Array(binCount);
//   }

//   setSmoothingTimeConstant(smoothingTimeConstant: number) {
//     this.analyzerNode.smoothingTimeConstant = smoothingTimeConstant;
//     this.analyzerNodeLeft.smoothingTimeConstant = smoothingTimeConstant;
//     this.analyzerNodeRight.smoothingTimeConstant = smoothingTimeConstant;
//   }

//   async init(audioElement: HTMLAudioElement) {
//     try {
//       if (this.context.state === "suspended") {
//         await this.context.resume();
//       }

//       if (!this.source && !this.isConnected) {
//         this.source = this.context.createMediaElementSource(audioElement);

//         // Connect source to splitter
//         this.source.connect(this.splitter);

//         // Connect left and right channels to their respective analyzers
//         this.splitter.connect(this.analyzerNodeLeft, 0);
//         this.splitter.connect(this.analyzerNodeRight, 1);

//         // Connect to merger for output
//         this.analyzerNodeLeft.connect(this.merger, 0, 0);
//         this.analyzerNodeRight.connect(this.merger, 0, 1);

//         // Also connect to main analyzer for combined analysis
//         this.source.connect(this.analyzerNode);

//         // Connect to destination
//         this.merger.connect(this.context.destination);
//         this.analyzerNode.connect(this.context.destination);

//         this.isConnected = true;
//       }

//       return true;
//     } catch (error) {
//       console.error("Error initializing audio:", error);
//       return false;
//     }
//   }

//   getFrequencyData() {
//     return this.frequencyByteData;
//   }

//   getFrequencyDataLeft() {
//     return this.frequencyByteDataLeft;
//   }

//   getFrequencyDataRight() {
//     return this.frequencyByteDataRight;
//   }

//   getTimeData() {
//     return this.timeByteData;
//   }

//   getAverage(index?: number, count?: number) {
//     let total = 0;
//     const start = index || 0;
//     const end = start + (count || this.binCount);
//     for (let i = start; i < end; i++) {
//       total += this.frequencyByteData[i];
//     }
//     return total / (end - start);
//   }

//   getAverageFloat(index?: number, count?: number) {
//     return this.getAverage(index, count) / 255;
//   }

//   updateSample() {
//     this.analyzerNode.getByteFrequencyData(this.frequencyByteData);
//     this.analyzerNodeLeft.getByteFrequencyData(this.frequencyByteDataLeft);
//     this.analyzerNodeRight.getByteFrequencyData(this.frequencyByteDataRight);
//     this.analyzerNode.getByteTimeDomainData(this.timeByteData);
//   }
// }

// const BASS_CONFIG = {
//   // 5 frequency sections
//   subBassIntensity: 0.5, // 20-60 Hz
//   lowBassIntensity: 0.6, // 60-250 Hz
//   lowMidIntensity: 0.8, // 250-500 Hz
//   highMidIntensity: 0.9, // 500-2000 Hz
//   highIntensity: 0.7, // 2000+ Hz

//   radiusMultiplier: 15,
//   radiusPower: 8,
//   particleScaleMax: 2,
//   roundnessMultiplier: 4,
//   lightIntensityMultiplier: 6,
//   rotationSpeedMax: 3,
//   enableColorShift: true,

//   // Shake parameters for sub-bass
//   subBassShakeIntensity: 8, // Erratic shake multiplier
//   // Rotation for sub-bass
//   subBassRotationIntensity: 1, // Spine rotation intensity
// };

// // Helper functions
// function catmullRom(
//   p0: number,
//   p1: number,
//   p2: number,
//   p3: number,
//   t: number,
// ): number {
//   const v0 = (p2 - p0) * 0.5;
//   const v1 = (p3 - p1) * 0.5;
//   const t2 = t * t;
//   const t3 = t * t * t;
//   return (
//     (2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 +
//     (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 +
//     v0 * t +
//     p1
//   );
// }

// const AudioVisualizer: React.FC = () => {
//   const containerRef = useRef<HTMLDivElement>(null);
//   const audioRef = useRef<HTMLAudioElement>(null);
//   const sceneRef = useRef<{
//     scene: THREE.Scene;
//     camera: THREE.PerspectiveCamera;
//     renderer: THREE.WebGLRenderer;
//     controls: CameraController;
//     particles: THREE.Mesh;
//     pathPositions: Float32Array;
//     radiusArray: Float32Array;
//     shakeArray: Float32Array;
//     rotationArray: Float32Array; // New array for spine rotation
//     panArray: Float32Array; // New array for stereo panning
//     analyzer?: AudioAnalyzer;
//     lights: {
//       light1: THREE.PointLight;
//       light2: THREE.DirectionalLight;
//       light3: THREE.DirectionalLight;
//     };
//   } | null>(null);
//   const frameId = useRef<number>();

//   const [isPlaying, setIsPlaying] = useState(false);
//   const [showPlayButton, setShowPlayButton] = useState(true);
//   const [debugInfo, setDebugInfo] = useState("Loading...");
//   const isPlayingRef = useRef(false);

//   const pathLength = 256;
//   const particleCount = 100000;
//   const prefabDelay = 0.00014;
//   const vertexDelay = 0.005;
//   const minDuration = 40;
//   const maxDuration = 600;

//   const animState = useRef({
//     time: 0,
//     noiseOffset: 0,
//     randomSeed: Math.random() * 1000,
//     previousBassAvg: 0,
//     bassHitTime: 0,
//     shakePhase: 0,
//     rotationPhase: 0, // For spine rotation
//   });

//   useEffect(() => {
//     if (!containerRef.current) return;

//     console.log(
//       "Initializing 100,000 particle system with 5 frequency sections...",
//     );

//     // Scene setup
//     const scene = new THREE.Scene();

//     // Camera
//     const camera = new THREE.PerspectiveCamera(
//       60,
//       window.innerWidth / window.innerHeight,
//       0.1,
//       10000,
//     );
//     camera.position.set(0, 0, 5000);

//     // Renderer
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(window.innerWidth, window.innerHeight);
//     renderer.setClearColor(0x000000);
//     containerRef.current.appendChild(renderer.domElement);

//     // Lights
//     const light1 = new THREE.PointLight(0xffffff, 0.25, 1200, 2);
//     light1.position.set(0, 0, 0);
//     light1.color.setRGB(
//       PARTICLE_COLOR.lights.color1.r,
//       PARTICLE_COLOR.lights.color1.g,
//       PARTICLE_COLOR.lights.color1.b,
//     );
//     scene.add(light1);

//     const light2 = new THREE.DirectionalLight(0xffffff, 0.25);
//     light2.position.set(0, 1, 1);
//     light2.color.setRGB(
//       PARTICLE_COLOR.lights.color2.r,
//       PARTICLE_COLOR.lights.color2.g,
//       PARTICLE_COLOR.lights.color2.b,
//     );
//     scene.add(light2);

//     const light3 = new THREE.DirectionalLight(0xffffff, 0.25);
//     light3.position.set(0, 1, -1);
//     light3.color.setRGB(
//       PARTICLE_COLOR.lights.color3.r,
//       PARTICLE_COLOR.lights.color3.g,
//       PARTICLE_COLOR.lights.color3.b,
//     );
//     scene.add(light3);

//     // Camera controller
//     const controls = new CameraController(camera, renderer.domElement);

//     // Create path
//     const pathPositions = new Float32Array(pathLength * 3);
//     const radiusArray = new Float32Array(pathLength);
//     const shakeArray = new Float32Array(pathLength * 3);
//     const rotationArray = new Float32Array(pathLength); // Rotation for each point
//     const panArray = new Float32Array(pathLength); // Stereo pan factor (-1 to 1)

//     for (let i = 0; i < pathLength; i++) {
//       let x, y, z;

//       if (i === 0) {
//         x = 0;
//         y = -1400;
//         z = 0;
//       } else if (i === pathLength - 1) {
//         x = 0;
//         y = 1200;
//         z = 0;
//       } else {
//         x = (Math.random() - 0.5) * 400;
//         y = -400 + (800 / pathLength) * i + (Math.random() - 0.5) * 200;
//         z = (Math.random() - 0.5) * 400;
//       }

//       pathPositions[i * 3] = x;
//       pathPositions[i * 3 + 1] = y;
//       pathPositions[i * 3 + 2] = z;
//       radiusArray[i] = 0;
//       shakeArray[i * 3] = 0;
//       shakeArray[i * 3 + 1] = 0;
//       shakeArray[i * 3 + 2] = 0;
//       rotationArray[i] = 0;
//       panArray[i] = 0;
//     }

//     // Create prefab geometry (sphere)
//     const prefabGeometry = new THREE.SphereGeometry(2, 4, 4);

//     // Extract vertices and indices from the BufferGeometry
//     const prefabPositions = prefabGeometry.attributes.position;
//     const prefabNormals = prefabGeometry.attributes.normal;
//     const prefabIndices = prefabGeometry.index;

//     const verticesPerPrefab = prefabPositions.count;
//     const indicesPerPrefab = prefabIndices ? prefabIndices.count : 0;

//     const totalVertices = particleCount * verticesPerPrefab;
//     const totalIndices = particleCount * indicesPerPrefab;

//     // Create buffer geometry
//     const geometry = new THREE.BufferGeometry();
//     const positions = new Float32Array(totalVertices * 3);
//     const colors = new Float32Array(totalVertices * 3);
//     const normals = new Float32Array(totalVertices * 3);
//     const delayDurations = new Float32Array(totalVertices * 2);
//     const pivots = new Float32Array(totalVertices * 3);
//     const axisAngles = new Float32Array(totalVertices * 4);
//     const indices = new Uint32Array(totalIndices);

//     // Initialize attributes
//     for (let i = 0; i < particleCount; i++) {
//       const delay = i * prefabDelay;
//       const duration =
//         minDuration + Math.random() * (maxDuration - minDuration);

//       // Random pivot (matching original range 0-2)
//       const pivot = new THREE.Vector3(
//         Math.random() * 2,
//         Math.random() * 2,
//         Math.random() * 2,
//       );

//       // Random axis and angle
//       const axis = new THREE.Vector3(
//         (Math.random() - 0.5) * 2,
//         (Math.random() - 0.5) * 2,
//         (Math.random() - 0.5) * 2,
//       ).normalize();
//       const angle = Math.PI * (12 + Math.random() * 12);

//       // Copy prefab vertices
//       for (let j = 0; j < verticesPerPrefab; j++) {
//         const vertexIndex = i * verticesPerPrefab + j;

//         // Copy positions
//         positions[vertexIndex * 3] = prefabPositions.getX(j);
//         positions[vertexIndex * 3 + 1] = prefabPositions.getY(j);
//         positions[vertexIndex * 3 + 2] = prefabPositions.getZ(j);

//         // Copy normals
//         normals[vertexIndex * 3] = prefabNormals.getX(j);
//         normals[vertexIndex * 3 + 1] = prefabNormals.getY(j);
//         normals[vertexIndex * 3 + 2] = prefabNormals.getZ(j);

//         // Set colors
//         colors[vertexIndex * 3] = PARTICLE_COLOR.r;
//         colors[vertexIndex * 3 + 1] = PARTICLE_COLOR.g;
//         colors[vertexIndex * 3 + 2] = PARTICLE_COLOR.b;

//         // Set animation attributes
//         delayDurations[vertexIndex * 2] = delay + j * vertexDelay;
//         delayDurations[vertexIndex * 2 + 1] = duration;

//         pivots[vertexIndex * 3] = pivot.x;
//         pivots[vertexIndex * 3 + 1] = pivot.y;
//         pivots[vertexIndex * 3 + 2] = pivot.z;

//         axisAngles[vertexIndex * 4] = axis.x;
//         axisAngles[vertexIndex * 4 + 1] = axis.y;
//         axisAngles[vertexIndex * 4 + 2] = axis.z;
//         axisAngles[vertexIndex * 4 + 3] = angle;
//       }

//       // Copy indices
//       if (prefabIndices) {
//         for (let j = 0; j < indicesPerPrefab; j++) {
//           indices[i * indicesPerPrefab + j] =
//             prefabIndices.getX(j) + i * verticesPerPrefab;
//         }
//       }
//     }

//     geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
//     geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
//     geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
//     geometry.setAttribute(
//       "aDelayDuration",
//       new THREE.BufferAttribute(delayDurations, 2),
//     );
//     geometry.setAttribute("aPivot", new THREE.BufferAttribute(pivots, 3));
//     geometry.setAttribute(
//       "aAxisAngle",
//       new THREE.BufferAttribute(axisAngles, 4),
//     );
//     geometry.setIndex(new THREE.BufferAttribute(indices, 1));

//     // Updated vertex shader with shake, rotation, and pan support
//     const vertexShader = `
//       #define PATH_LENGTH ${pathLength}

//       uniform float uTime;
//       uniform vec3 uPath[PATH_LENGTH];
//       uniform float uRadius[PATH_LENGTH];
//       uniform vec3 uShake[PATH_LENGTH];
//       uniform float uRotation[PATH_LENGTH];
//       uniform float uPan[PATH_LENGTH];
//       uniform vec2 uRoundness;
//       uniform float uParticleScale;

//       attribute vec2 aDelayDuration;
//       attribute vec3 aPivot;
//       attribute vec4 aAxisAngle;

//       varying vec3 vColor;
//       varying vec3 vNormal;
//       varying vec3 vWorldPosition;

//       vec3 rotateVector(vec4 q, vec3 v) {
//         return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
//       }

//       vec4 quatFromAxisAngle(vec3 axis, float angle) {
//         float halfAngle = angle * 0.5;
//         return vec4(axis.xyz * sin(halfAngle), cos(halfAngle));
//       }

//       float catmullRom(float p0, float p1, float p2, float p3, float t) {
//         float v0 = (p2 - p0) * 0.5;
//         float v1 = (p3 - p1) * 0.5;
//         float t2 = t * t;
//         float t3 = t * t * t;
//         return (2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1;
//       }

//       vec3 catmullRom(vec3 p0, vec3 p1, vec3 p2, vec3 p3, vec2 c, float t) {
//         vec3 v0 = (p2 - p0) * c.x;
//         vec3 v1 = (p3 - p1) * c.y;
//         float t2 = t * t;
//         float t3 = t * t * t;
//         return vec3((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);
//       }

//       vec3 catmullRomShake(vec3 s0, vec3 s1, vec3 s2, vec3 s3, float t) {
//         return vec3(
//           catmullRom(s0.x, s1.x, s2.x, s3.x, t),
//           catmullRom(s0.y, s1.y, s2.y, s3.y, t),
//           catmullRom(s0.z, s1.z, s2.z, s3.z, t)
//         );
//       }

//       void main() {
//         vColor = color;

//         float tDelay = aDelayDuration.x;
//         float tDuration = aDelayDuration.y;
//         float tTime = clamp(uTime - tDelay, 0.0, tDuration);
//         float tProgress = tTime / tDuration;
//         float angle = aAxisAngle.w * tProgress;
//         vec4 tQuat = quatFromAxisAngle(aAxisAngle.xyz, angle);

//         // Transform normal
//         vec3 objectNormal = normal;
//         objectNormal = rotateVector(tQuat, objectNormal);

//         // Transform position
//         vec3 transformed = position;
//         float tMax = float(PATH_LENGTH - 1);
//         float tPoint = tMax * tProgress;
//         float tIndex = floor(tPoint);
//         float tWeight = tPoint - tIndex;

//         int i0 = int(max(0.0, tIndex - 1.0));
//         int i1 = int(tIndex);
//         int i2 = int(min(tIndex + 1.0, tMax));
//         int i3 = int(min(tIndex + 2.0, tMax));

//         vec3 p0 = uPath[i0];
//         vec3 p1 = uPath[i1];
//         vec3 p2 = uPath[i2];
//         vec3 p3 = uPath[i3];

//         // Interpolate shake
//         vec3 s0 = uShake[i0];
//         vec3 s1 = uShake[i1];
//         vec3 s2 = uShake[i2];
//         vec3 s3 = uShake[i3];
//         vec3 shake = catmullRomShake(s0, s1, s2, s3, tWeight);

//         // Interpolate rotation
//         float rotation = catmullRom(uRotation[i0], uRotation[i1], uRotation[i2], uRotation[i3], tWeight);

//         // Interpolate pan
//         float pan = catmullRom(uPan[i0], uPan[i1], uPan[i2], uPan[i3], tWeight);

//         // Apply pan to radius based on pivot position
//         float radius = catmullRom(uRadius[i0], uRadius[i1], uRadius[i2], uRadius[i3], tWeight);

//         // Pan affects particles based on their angular position around the spine
//         float particleAngle = atan(aPivot.z, aPivot.x);
//         float panEffect = 1.0 + pan * cos(particleAngle) * 0.5; // Pan affects left/right differently
//         radius *= panEffect;

//         transformed += aPivot * radius;

//         // Apply rotation around Y axis for spine rotation
//         if (abs(rotation) > 0.01) {
//           mat3 rotMat = mat3(
//             cos(rotation), 0.0, sin(rotation),
//             0.0, 1.0, 0.0,
//             -sin(rotation), 0.0, cos(rotation)
//           );
//           transformed = rotMat * transformed;
//         }

//         transformed = rotateVector(tQuat, transformed);
//         transformed *= uParticleScale;

//         // Add base position and shake
//         vec3 basePosition = catmullRom(p0, p1, p2, p3, uRoundness, tWeight);
//         transformed += basePosition + shake;

//         vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
//         gl_Position = projectionMatrix * mvPosition;

//         vNormal = normalize(normalMatrix * objectNormal);
//         vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
//       }
//     `;

//     // Fragment shader (same as original)
//     const fragmentShader = `
//       uniform vec3 uEmissive;
//       uniform vec3 uLightPos1;
//       uniform vec3 uLightPos2;
//       uniform vec3 uLightPos3;
//       uniform vec3 uLightColor1;
//       uniform vec3 uLightColor2;
//       uniform vec3 uLightColor3;
//       uniform float uLightIntensity1;
//       uniform float uLightIntensity2;
//       uniform float uLightIntensity3;

//       varying vec3 vColor;
//       varying vec3 vNormal;
//       varying vec3 vWorldPosition;

//       void main() {
//         vec3 normal = normalize(vNormal);
//         vec3 finalColor = uEmissive * vColor;

//         // Light 1 (point light)
//         vec3 lightDir1 = normalize(uLightPos1 - vWorldPosition);
//         float diff1 = max(dot(normal, lightDir1), 0.0);
//         float distance1 = length(uLightPos1 - vWorldPosition);
//         float attenuation1 = 1.0 / (1.0 + 0.001 * distance1 + 0.0001 * distance1 * distance1);
//         finalColor += vColor * uLightColor1 * diff1 * uLightIntensity1 * attenuation1;

//         // Light 2 (directional)
//         vec3 lightDir2 = normalize(uLightPos2);
//         float diff2 = max(dot(normal, lightDir2), 0.0);
//         finalColor += vColor * uLightColor2 * diff2 * uLightIntensity2;

//         // Light 3 (directional)
//         vec3 lightDir3 = normalize(uLightPos3);
//         float diff3 = max(dot(normal, lightDir3), 0.0);
//         finalColor += vColor * uLightColor3 * diff3 * uLightIntensity3;

//         // Add ambient
//         finalColor += vColor * 0.1;

//         gl_FragColor = vec4(finalColor, 1.0);
//       }
//     `;

//     // Create material
//     const material = new THREE.ShaderMaterial({
//       uniforms: {
//         uTime: { value: 0 },
//         uPath: { value: pathPositions },
//         uRadius: { value: radiusArray },
//         uShake: { value: shakeArray },
//         uRotation: { value: rotationArray },
//         uPan: { value: panArray },
//         uRoundness: { value: new THREE.Vector2(2, 2) },
//         uParticleScale: { value: 1.0 },
//         uEmissive: {
//           value: new THREE.Color(
//             PARTICLE_COLOR.emissive.r,
//             PARTICLE_COLOR.emissive.g,
//             PARTICLE_COLOR.emissive.b,
//           ),
//         },
//         uLightPos1: { value: new THREE.Vector3(0, 0, 0) },
//         uLightPos2: { value: new THREE.Vector3(0, 1, 1) },
//         uLightPos3: { value: new THREE.Vector3(0, 1, -1) },
//         uLightColor1: {
//           value: new THREE.Color(
//             PARTICLE_COLOR.lights.color1.r,
//             PARTICLE_COLOR.lights.color1.g,
//             PARTICLE_COLOR.lights.color1.b,
//           ),
//         },
//         uLightColor2: {
//           value: new THREE.Color(
//             PARTICLE_COLOR.lights.color2.r,
//             PARTICLE_COLOR.lights.color2.g,
//             PARTICLE_COLOR.lights.color2.b,
//           ),
//         },
//         uLightColor3: {
//           value: new THREE.Color(
//             PARTICLE_COLOR.lights.color3.r,
//             PARTICLE_COLOR.lights.color3.g,
//             PARTICLE_COLOR.lights.color3.b,
//           ),
//         },
//         uLightIntensity1: { value: 0.25 },
//         uLightIntensity2: { value: 0.25 },
//         uLightIntensity3: { value: 0.25 },
//       },
//       vertexShader,
//       fragmentShader,
//       vertexColors: true,
//       side: THREE.DoubleSide,
//     });

//     const particles = new THREE.Mesh(geometry, material);
//     particles.frustumCulled = false;
//     scene.add(particles);

//     // Store references
//     sceneRef.current = {
//       scene,
//       camera,
//       renderer,
//       controls,
//       particles,
//       pathPositions,
//       radiusArray,
//       shakeArray,
//       rotationArray,
//       panArray,
//       lights: { light1, light2, light3 },
//       analyzer: undefined,
//     };

//     setDebugInfo("Ready to play");
//     console.log("Particle system ready");

//     // Animation loop
//     let frameCount = 0;
//     const animate = () => {
//       frameId.current = requestAnimationFrame(animate);
//       frameCount++;

//       if (!sceneRef.current) return;

//       const {
//         camera,
//         renderer,
//         scene,
//         controls,
//         particles,
//         radiusArray,
//         shakeArray,
//         rotationArray,
//         panArray,
//       } = sceneRef.current;
//       const anim = animState.current;

//       controls.update();

//       // Update time
//       anim.time = audioRef.current?.currentTime || 0;
//       if (particles.material && particles.material.uniforms) {
//         particles.material.uniforms.uTime.value = anim.time;
//       }

//       // Update shake phase for erratic movement
//       anim.shakePhase += 0.3;
//       anim.rotationPhase += 0.02;

//       // Audio processing
//       if (
//         sceneRef.current.analyzer &&
//         isPlayingRef.current &&
//         audioRef.current &&
//         !audioRef.current.paused
//       ) {
//         sceneRef.current.analyzer.updateSample();
//         const data = sceneRef.current.analyzer.frequencyByteData;
//         const dataLeft = sceneRef.current.analyzer.frequencyByteDataLeft;
//         const dataRight = sceneRef.current.analyzer.frequencyByteDataRight;
//         const dataArray: number[] = [];
//         const cap = data.length * 0.5;

//         anim.noiseOffset += 0.01;

//         // Calculate frequency bands for 5 sections
//         const sampleRate = 44100;
//         const binHz = sampleRate / (sceneRef.current.analyzer.binCount * 2);

//         // Frequency boundaries
//         const subBassEnd = Math.floor(60 / binHz); // 20-60 Hz
//         const lowBassEnd = Math.floor(250 / binHz); // 60-250 Hz
//         const lowMidEnd = Math.floor(500 / binHz); // 250-500 Hz
//         const highMidEnd = Math.floor(2000 / binHz); // 500-2000 Hz
//         // Everything above 2000 Hz is highs

//         // Calculate averages for each band with full stereo analysis
//         let subBassTotal = 0,
//           lowBassTotal = 0,
//           lowMidTotal = 0,
//           highMidTotal = 0,
//           highTotal = 0;
//         let subBassLeft = 0,
//           subBassRight = 0;
//         let lowBassLeft = 0,
//           lowBassRight = 0;
//         let lowMidLeft = 0,
//           lowMidRight = 0;
//         let highMidLeft = 0,
//           highMidRight = 0;
//         let highLeft = 0,
//           highRight = 0;

//         // Sub-bass with stereo analysis
//         for (let i = 0; i < subBassEnd; i++) {
//           subBassTotal += data[i];
//           subBassLeft += dataLeft[i];
//           subBassRight += dataRight[i];
//         }
//         let subBassAvg =
//           (subBassTotal / Math.max(1, subBassEnd) / 255) *
//           BASS_CONFIG.subBassIntensity;
//         let subBassLeftAvg = subBassLeft / Math.max(1, subBassEnd) / 255;
//         let subBassRightAvg = subBassRight / Math.max(1, subBassEnd) / 255;

//         // Low bass with stereo
//         for (let i = subBassEnd; i < lowBassEnd; i++) {
//           lowBassTotal += data[i];
//           lowBassLeft += dataLeft[i];
//           lowBassRight += dataRight[i];
//         }
//         let lowBassAvg =
//           (lowBassTotal / Math.max(1, lowBassEnd - subBassEnd) / 255) *
//           BASS_CONFIG.lowBassIntensity;
//         let lowBassLeftAvg =
//           lowBassLeft / Math.max(1, lowBassEnd - subBassEnd) / 255;
//         let lowBassRightAvg =
//           lowBassRight / Math.max(1, lowBassEnd - subBassEnd) / 255;

//         // Low mids with stereo
//         for (let i = lowBassEnd; i < lowMidEnd; i++) {
//           lowMidTotal += data[i];
//           lowMidLeft += dataLeft[i];
//           lowMidRight += dataRight[i];
//         }
//         let lowMidAvg =
//           (lowMidTotal / Math.max(1, lowMidEnd - lowBassEnd) / 255) *
//           BASS_CONFIG.lowMidIntensity;
//         let lowMidLeftAvg =
//           lowMidLeft / Math.max(1, lowMidEnd - lowBassEnd) / 255;
//         let lowMidRightAvg =
//           lowMidRight / Math.max(1, lowMidEnd - lowBassEnd) / 255;

//         // High mids with stereo
//         for (let i = lowMidEnd; i < highMidEnd; i++) {
//           highMidTotal += data[i];
//           highMidLeft += dataLeft[i];
//           highMidRight += dataRight[i];
//         }
//         let highMidAvg =
//           (highMidTotal / Math.max(1, highMidEnd - lowMidEnd) / 255) *
//           BASS_CONFIG.highMidIntensity;
//         let highMidLeftAvg =
//           highMidLeft / Math.max(1, highMidEnd - lowMidEnd) / 255;
//         let highMidRightAvg =
//           highMidRight / Math.max(1, highMidEnd - lowMidEnd) / 255;

//         // Highs with stereo
//         for (let i = highMidEnd; i < cap; i++) {
//           highTotal += data[i];
//           highLeft += dataLeft[i];
//           highRight += dataRight[i];
//         }
//         let highAvg =
//           (highTotal / Math.max(1, cap - highMidEnd) / 255) *
//           BASS_CONFIG.highIntensity;
//         let highLeftAvg = highLeft / Math.max(1, cap - highMidEnd) / 255;
//         let highRightAvg = highRight / Math.max(1, cap - highMidEnd) / 255;

//         // Calculate stereo pan for each band (-1 = left, 0 = center, 1 = right)
//         const calculatePan = (left: number, right: number) => {
//           if (left + right > 0.01) {
//             return (right - left) / (left + right);
//           }
//           return 0;
//         };

//         let subBassPan = calculatePan(subBassLeftAvg, subBassRightAvg);
//         let lowBassPan = calculatePan(lowBassLeftAvg, lowBassRightAvg);
//         let lowMidPan = calculatePan(lowMidLeftAvg, lowMidRightAvg);
//         let highMidPan = calculatePan(highMidLeftAvg, highMidRightAvg);
//         let highPan = calculatePan(highLeftAvg, highRightAvg);

//         // Add noise to frequency averages
//         subBassAvg +=
//           Math.sin(anim.noiseOffset * 2.3 + anim.randomSeed) *
//           0.05 *
//           subBassAvg;
//         lowBassAvg +=
//           Math.sin(anim.noiseOffset * 1.9 + anim.randomSeed * 1.1) *
//           0.05 *
//           lowBassAvg;
//         lowMidAvg +=
//           Math.sin(anim.noiseOffset * 1.7 + anim.randomSeed * 2) *
//           0.05 *
//           lowMidAvg;
//         highMidAvg +=
//           Math.sin(anim.noiseOffset * 2.1 + anim.randomSeed * 2.5) *
//           0.05 *
//           highMidAvg;
//         highAvg +=
//           Math.sin(anim.noiseOffset * 3.1 + anim.randomSeed * 3) *
//           0.05 *
//           highAvg;

//         // Bass hit detection for sub-bass
//         const bassHit = subBassAvg > 0.6 && anim.previousBassAvg < 0.5;
//         if (bassHit) {
//           anim.bassHitTime = Date.now();
//         }
//         anim.previousBassAvg = subBassAvg;

//         // Complex radius calculation - THIS IS THE KEY PART
//         const currentTime = audioRef.current.currentTime || 0;
//         const prefabDelay = 0.00015;
//         let minVisibleProgress = 1.0;
//         let maxVisibleProgress = 0.0;
//         let avgDuration = 170;
//         avgDuration += Math.sin(anim.noiseOffset * 0.5) * 10;

//         // Calculate visible range
//         for (let i = 0; i < cap; i++) {
//           const segmentDelay = i * prefabDelay;
//           const timeInPath = currentTime - segmentDelay;
//           const progressAlongPath = Math.min(
//             1.0,
//             Math.max(0.0, timeInPath / avgDuration),
//           );

//           if (timeInPath > 0 && timeInPath < avgDuration) {
//             minVisibleProgress = Math.min(
//               minVisibleProgress,
//               progressAlongPath,
//             );
//             maxVisibleProgress = Math.max(
//               maxVisibleProgress,
//               progressAlongPath,
//             );
//           }
//         }

//         if (maxVisibleProgress <= minVisibleProgress) {
//           minVisibleProgress = 0.0;
//           maxVisibleProgress = 0.5; // Show more range for 5 sections
//         }

//         const visibleRange = maxVisibleProgress - minVisibleProgress;
//         const sectionSize = visibleRange / 5; // Divide into 5 equal sections

//         // Calculate thresholds for 5 sections
//         const subBassThreshold = minVisibleProgress + sectionSize;
//         const lowBassThreshold = minVisibleProgress + sectionSize * 2;
//         const lowMidThreshold = minVisibleProgress + sectionSize * 3;
//         const highMidThreshold = minVisibleProgress + sectionSize * 4;

//         // Clear arrays
//         for (let i = 0; i < pathLength; i++) {
//           shakeArray[i * 3] = 0;
//           shakeArray[i * 3 + 1] = 0;
//           shakeArray[i * 3 + 2] = 0;
//           rotationArray[i] = 0;
//           panArray[i] = 0;
//         }

//         // Process frequency data for all segments (ORIGINAL LOGIC)
//         for (let pass = 0; pass < 4; pass++) {
//           for (let i = 0; i < cap; i++) {
//             let idx = i;
//             if (pass === 1) idx = cap - 1 - i;

//             const segmentDelay = (pass < 2 ? i : i + cap) * prefabDelay;
//             const timeInPath = currentTime - segmentDelay;
//             const progressAlongPath = Math.min(
//               1.0,
//               Math.max(0.0, timeInPath / avgDuration),
//             );

//             let weight = 1.0;
//             let freqValue = 0;
//             let isInSubBassSection = false;
//             let currentFreqAvg = 0;

//             // Determine which frequency section this particle is in
//             if (progressAlongPath <= subBassThreshold || timeInPath <= 0) {
//               // Sub-bass section
//               isInSubBassSection = true;
//               currentFreqAvg = subBassAvg;
//               weight = 1.8 + subBassAvg * 4.0;
//               weight += (Math.random() - 0.5) * 0.3;
//               if (idx < subBassEnd) {
//                 freqValue = data[idx] * weight;
//               } else {
//                 freqValue = subBassAvg * 255 * weight * 0.6;
//               }
//               if (bassHit && Math.random() > 0.7) {
//                 freqValue *= 1.3 + Math.random() * 0.4;
//               }
//             } else if (progressAlongPath < lowBassThreshold) {
//               // Low bass section
//               currentFreqAvg = lowBassAvg;
//               weight = 1.5 + lowBassAvg * 3.0;
//               weight += (Math.random() - 0.5) * 0.25;
//               if (idx >= subBassEnd && idx < lowBassEnd) {
//                 freqValue = data[idx] * weight;
//               } else {
//                 freqValue = lowBassAvg * 255 * weight * 0.65;
//               }
//             } else if (progressAlongPath < lowMidThreshold) {
//               // Low mid section
//               currentFreqAvg = lowMidAvg;
//               weight = 1.2 + lowMidAvg * 2.0;
//               weight += (Math.random() - 0.5) * 0.2;
//               if (idx >= lowBassEnd && idx < lowMidEnd) {
//                 freqValue = data[idx] * weight;
//               } else {
//                 freqValue = lowMidAvg * 255 * weight * 0.7;
//               }
//             } else if (progressAlongPath < highMidThreshold) {
//               // High mid section
//               currentFreqAvg = highMidAvg;
//               weight = 1.0 + highMidAvg * 1.5;
//               weight += (Math.random() - 0.5) * 0.15;
//               if (idx >= lowMidEnd && idx < highMidEnd) {
//                 freqValue = data[idx] * weight;
//               } else {
//                 freqValue = highMidAvg * 255 * weight * 0.75;
//               }
//             } else {
//               // High section
//               currentFreqAvg = highAvg;
//               weight = 1.0 + highAvg * 1.5;
//               weight += (Math.random() - 0.5) * 0.15;
//               if (idx >= highMidEnd) {
//                 freqValue = data[idx] * weight;
//               } else {
//                 freqValue = highAvg * 255 * weight * 0.8;
//               }
//             }

//             if (pass >= 2) {
//               freqValue *= 0.7;
//             }

//             dataArray.push(freqValue);

//             // Apply effects based on section
//             if (i < pathLength) {
//               const pathIndex = Math.floor(
//                 progressAlongPath * (pathLength - 1),
//               );
//               if (pathIndex >= 0 && pathIndex < pathLength) {
//                 // Sub-bass section: shake, rotation, and pan
//                 if (isInSubBassSection && subBassAvg > 0.1) {
//                   // Erratic shake
//                   const shakeIntensity =
//                     subBassAvg * BASS_CONFIG.subBassShakeIntensity;
//                   const shake1 = Math.sin(
//                     anim.shakePhase * 7.3 + pathIndex * 0.5,
//                   );
//                   const shake2 = Math.sin(
//                     anim.shakePhase * 13.7 + pathIndex * 0.7,
//                   );
//                   const shake3 = Math.sin(
//                     anim.shakePhase * 23.1 + pathIndex * 1.1,
//                   );

//                   shakeArray[pathIndex * 3] +=
//                     shake1 * shakeIntensity * (Math.random() - 0.5);
//                   shakeArray[pathIndex * 3 + 1] +=
//                     shake2 * shakeIntensity * (Math.random() - 0.5);
//                   shakeArray[pathIndex * 3 + 2] +=
//                     shake3 * shakeIntensity * (Math.random() - 0.5);

//                   // Spine rotation
//                   rotationArray[pathIndex] =
//                     Math.sin(anim.rotationPhase + pathIndex * 0.1) *
//                     subBassAvg *
//                     BASS_CONFIG.subBassRotationIntensity;

//                   // Stereo pan for sub-bass
//                   panArray[pathIndex] = subBassPan * subBassAvg;

//                   // Extra effects on bass hit
//                   if (bassHit) {
//                     shakeArray[pathIndex * 3] *= 1.5;
//                     shakeArray[pathIndex * 3 + 1] *= 1.5;
//                     shakeArray[pathIndex * 3 + 2] *= 1.5;
//                     rotationArray[pathIndex] *= 2.0;
//                   }
//                 } else if (progressAlongPath < lowBassThreshold) {
//                   // Low bass section - pan only
//                   panArray[pathIndex] = lowBassPan * lowBassAvg;
//                 } else if (progressAlongPath < lowMidThreshold) {
//                   // Low mid section - pan only
//                   panArray[pathIndex] = lowMidPan * lowMidAvg;
//                 } else if (progressAlongPath < highMidThreshold) {
//                   // High mid section - pan only
//                   panArray[pathIndex] = highMidPan * highMidAvg;
//                 } else {
//                   // High section - pan only
//                   panArray[pathIndex] = highPan * highAvg;
//                 }
//               }
//             }
//           }
//         }

//         // Update radius array based on processed data
//         for (let i = 0; i < pathLength; i++) {
//           // Make sure we have data for this index
//           if (i < dataArray.length) {
//             let val = dataArray[i] / 255;
//             val += Math.sin(anim.noiseOffset * 4 + i * 0.2) * 0.02;
//             val = Math.max(0, Math.min(1, val));

//             let baseRadius =
//               Math.pow(val, BASS_CONFIG.radiusPower) *
//               BASS_CONFIG.radiusMultiplier;
//             baseRadius += (Math.random() - 0.5) * 2;

//             // Calculate which section this path point belongs to
//             const pathProgress = i / (pathLength - 1);

//             // Extra boost for sub-bass section (first 20% of visible particles)
//             if (pathProgress <= 0.2) {
//               baseRadius += subBassAvg * subBassAvg * 120;
//               if (bassHit && Math.random() > 0.6) {
//                 baseRadius *= 1.2 + Math.random() * 0.3;
//               }
//             }

//             radiusArray[i] = Math.max(1, baseRadius);
//           } else {
//             // For any remaining path points, use the frequency section averages
//             const pathProgress = i / (pathLength - 1);
//             let sectionAvg = 0;

//             if (pathProgress <= 0.2) {
//               sectionAvg = subBassAvg;
//             } else if (pathProgress <= 0.4) {
//               sectionAvg = lowBassAvg;
//             } else if (pathProgress <= 0.6) {
//               sectionAvg = lowMidAvg;
//             } else if (pathProgress <= 0.8) {
//               sectionAvg = highMidAvg;
//             } else {
//               sectionAvg = highAvg;
//             }

//             let baseRadius =
//               Math.pow(sectionAvg, BASS_CONFIG.radiusPower) *
//               BASS_CONFIG.radiusMultiplier;
//             baseRadius += (Math.random() - 0.5) * 2;

//             radiusArray[i] = Math.max(10, baseRadius);
//           }
//         }

//         // Update material uniforms
//         if (particles.material && particles.material.uniforms) {
//           // Roundness (affected by sub-bass)
//           const r =
//             BASS_CONFIG.roundnessMultiplier * Math.pow(subBassAvg, 2) + 1;
//           particles.material.uniforms.uRoundness.value.set(
//             r + Math.sin(anim.noiseOffset * 3) * 0.5,
//             r + Math.sin(anim.noiseOffset * 3) * 0.5,
//           );

//           // Particle scale
//           const bassParticleScale =
//             1.0 + subBassAvg * (BASS_CONFIG.particleScaleMax - 1.0) * 1.5;
//           const overallEnergy =
//             subBassAvg * 0.3 +
//             lowBassAvg * 0.2 +
//             lowMidAvg * 0.2 +
//             highMidAvg * 0.15 +
//             highAvg * 0.15;
//           let particleScale =
//             1.0 + overallEnergy * (BASS_CONFIG.particleScaleMax - 1.0);
//           particleScale = Math.max(particleScale, bassParticleScale);
//           particleScale +=
//             Math.sin(anim.noiseOffset * 5 + anim.randomSeed) * 0.05;

//           particles.material.uniforms.uParticleScale.value = particleScale;
//           particles.material.uniforms.uRadius.needsUpdate = true;
//           particles.material.uniforms.uShake.needsUpdate = true;
//           particles.material.uniforms.uRotation.needsUpdate = true;
//           particles.material.uniforms.uPan.needsUpdate = true;
//         }

//         // Force update uniforms
//         if (particles.material && particles.material.uniforms) {
//           particles.material.uniforms.uRadius.value = radiusArray;
//           particles.material.uniforms.uShake.value = shakeArray;
//           particles.material.uniforms.uRotation.value = rotationArray;
//           particles.material.uniforms.uPan.value = panArray;
//           particles.material.uniforms.uRadius.needsUpdate = true;
//           particles.material.uniforms.uShake.needsUpdate = true;
//           particles.material.uniforms.uRotation.needsUpdate = true;
//           particles.material.uniforms.uPan.needsUpdate = true;
//         }

//         // Update lights based on sub-bass
//         const { lights } = sceneRef.current;
//         const lightIntensity =
//           subBassAvg * BASS_CONFIG.lightIntensityMultiplier;
//         const flicker = bassHit
//           ? 0.8 + Math.random() * 0.4
//           : 0.9 + Math.random() * 0.1;

//         lights.light1.intensity = Math.pow(lightIntensity, 2) * flicker;
//         lights.light2.intensity =
//           Math.pow(lightIntensity, 3) * 0.5 * (0.9 + Math.random() * 0.1);
//         lights.light3.intensity =
//           Math.pow(lightIntensity, 3) * 0.5 * (0.9 + Math.random() * 0.1);

//         // Update material light uniforms
//         if (particles.material && particles.material.uniforms) {
//           particles.material.uniforms.uLightIntensity1.value =
//             lights.light1.intensity;
//           particles.material.uniforms.uLightIntensity2.value =
//             lights.light2.intensity;
//           particles.material.uniforms.uLightIntensity3.value =
//             lights.light3.intensity;

//           // Color shift based on sub-bass
//           if (BASS_CONFIG.enableColorShift && subBassAvg > 0.5) {
//             const hueShift = Math.sin(anim.noiseOffset * 2) * 0.05;
//             lights.light1.color.setHSL(
//               0.0 + hueShift,
//               1.0,
//               0.5 + subBassAvg * 0.5,
//             );
//             lights.light2.color.setHSL(
//               0.1 + hueShift * 0.5,
//               0.8,
//               0.5 + subBassAvg * 0.3,
//             );
//             lights.light3.color.setHSL(
//               0.05 + hueShift * 0.7,
//               0.9,
//               0.5 + subBassAvg * 0.4,
//             );

//             particles.material.uniforms.uLightColor1.value.copy(
//               lights.light1.color,
//             );
//             particles.material.uniforms.uLightColor2.value.copy(
//               lights.light2.color,
//             );
//             particles.material.uniforms.uLightColor3.value.copy(
//               lights.light3.color,
//             );
//           } else {
//             // Reset to original colors
//             lights.light1.color.setRGB(
//               PARTICLE_COLOR.lights.color1.r,
//               PARTICLE_COLOR.lights.color1.g,
//               PARTICLE_COLOR.lights.color1.b,
//             );
//             lights.light2.color.setRGB(
//               PARTICLE_COLOR.lights.color2.r,
//               PARTICLE_COLOR.lights.color2.g,
//               PARTICLE_COLOR.lights.color2.b,
//             );
//             lights.light3.color.setRGB(
//               PARTICLE_COLOR.lights.color3.r,
//               PARTICLE_COLOR.lights.color3.g,
//               PARTICLE_COLOR.lights.color3.b,
//             );

//             particles.material.uniforms.uLightColor1.value.set(
//               PARTICLE_COLOR.lights.color1.r,
//               PARTICLE_COLOR.lights.color1.g,
//               PARTICLE_COLOR.lights.color1.b,
//             );
//             particles.material.uniforms.uLightColor2.value.set(
//               PARTICLE_COLOR.lights.color2.r,
//               PARTICLE_COLOR.lights.color2.g,
//               PARTICLE_COLOR.lights.color2.b,
//             );
//             particles.material.uniforms.uLightColor3.value.set(
//               PARTICLE_COLOR.lights.color3.r,
//               PARTICLE_COLOR.lights.color3.g,
//               PARTICLE_COLOR.lights.color3.b,
//             );
//           }
//         }

//         // Update rotation speed based on sub-bass
//         let rotSpeed = 2.0 + subBassAvg * BASS_CONFIG.rotationSpeedMax;
//         rotSpeed += Math.sin(anim.noiseOffset * 0.7) * 0.5;
//         if (Date.now() - anim.bassHitTime < 500) {
//           rotSpeed += (Math.random() - 0.5) * 3;
//         }
//         controls.autoRotateSpeed = rotSpeed;

//         if (frameCount % 30 === 0) {
//           setDebugInfo(
//             `Sub: ${(subBassAvg * 100).toFixed(0)}% | Low: ${(lowBassAvg * 100).toFixed(0)}% | LMid: ${(lowMidAvg * 100).toFixed(0)}% | HMid: ${(highMidAvg * 100).toFixed(0)}% | High: ${(highAvg * 100).toFixed(0)}% | Pan: ${subBassPan.toFixed(2)}`,
//           );
//         }
//       } else {
//         // Default animation when not playing
//         for (let i = 0; i < pathLength; i++) {
//           radiusArray[i] = 0;
//           shakeArray[i * 3] = 0;
//           shakeArray[i * 3 + 1] = 0;
//           shakeArray[i * 3 + 2] = 0;
//           rotationArray[i] = 0;
//           panArray[i] = 0;
//         }
//       }

//       renderer.render(scene, camera);
//     };

//     animate();

//     // Handle resize
//     const handleResize = () => {
//       if (!sceneRef.current) return;
//       const { camera, renderer } = sceneRef.current;
//       camera.aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(window.innerWidth, window.innerHeight);
//     };

//     window.addEventListener("resize", handleResize);

//     // Cleanup
//     return () => {
//       window.removeEventListener("resize", handleResize);
//       if (frameId.current) {
//         cancelAnimationFrame(frameId.current);
//       }
//       controls.dispose();
//       if (sceneRef.current) {
//         sceneRef.current.renderer.dispose();
//       }
//       if (containerRef.current?.contains(renderer.domElement)) {
//         containerRef.current.removeChild(renderer.domElement);
//       }
//     };
//   }, []);

//   const handlePlay = async () => {
//     console.log("handlePlay called");
//     if (!audioRef.current || !sceneRef.current) {
//       console.log("Missing refs:", {
//         audio: !!audioRef.current,
//         scene: !!sceneRef.current,
//       });
//       return;
//     }

//     setDebugInfo("Initializing audio...");

//     try {
//       if (!sceneRef.current.analyzer) {
//         console.log("Creating analyzer...");
//         sceneRef.current.analyzer = new AudioAnalyzer(pathLength * 4, 0.85);
//       }

//       console.log("Initializing analyzer...");
//       const success = await sceneRef.current.analyzer.init(audioRef.current);
//       if (!success) {
//         setDebugInfo("Failed to initialize audio");
//         return;
//       }

//       // Ensure audio context is resumed
//       if (sceneRef.current.analyzer.context.state === "suspended") {
//         await sceneRef.current.analyzer.context.resume();
//         console.log("Audio context resumed");
//       }

//       audioRef.current.currentTime = 0;
//       console.log("About to play audio...");
//       await audioRef.current.play();
//       console.log("Audio play() called successfully");

//       setIsPlaying(true);
//       isPlayingRef.current = true;
//       setShowPlayButton(false);
//       setDebugInfo("Playing...");
//       console.log("State updated: isPlaying = true, analyzer connected");

//       if (sceneRef.current) {
//         // Set camera far away initially like original
//         sceneRef.current.camera.position.set(0, 0, 10000);
//         sceneRef.current.controls.distance = 10000;
//         sceneRef.current.controls.targetDistance = 1000;
//       }
//     } catch (error) {
//       console.error("Error playing audio:", error);
//       setDebugInfo(`Error: ${error}`);
//     }
//   };

//   return (
//     <div className="relative h-screen w-full overflow-hidden bg-black">
//       <div ref={containerRef} className="h-full w-full" />

//       <audio
//         ref={audioRef}
//         crossOrigin="anonymous"
//         src={aud}
//         onEnded={() => {
//           setIsPlaying(false);
//           isPlayingRef.current = false;
//           setShowPlayButton(true);
//           setDebugInfo("Ready to play");
//         }}
//       />

//       {showPlayButton && (
//         <div className="bg-opacity-60 absolute inset-0 flex items-center justify-center bg-black">
//           <div className="text-center">
//             <button
//               onClick={handlePlay}
//               className="mb-4 rounded-lg bg-red-600 px-8 py-4 text-xl font-bold text-white shadow-lg transition-colors duration-200 hover:bg-red-700"
//             >
//               Play 100,000 Particles
//             </button>
//             <p className="text-sm text-white">
//               Particles will flow along a path and react to music
//             </p>
//           </div>
//         </div>
//       )}

//       <div className="bg-opacity-70 absolute bottom-4 left-4 rounded bg-black p-2 text-xs text-white">
//         {debugInfo} | {particleCount.toLocaleString()} particles | Scroll to
//         zoom
//       </div>
//     </div>
//   );
// };

// export default AudioVisualizer;
