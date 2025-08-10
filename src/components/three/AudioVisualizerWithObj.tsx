import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { levels_loj } from "../../assets/mp3s";
const aud = levels_loj; // Update this path as needed

// Particle color configuration
const PARTICLE_COLOR = {
  r: 1,
  g: 1,
  b: 1,
  emissive: {
    r: 0.85,
    g: 0.85,
    b: 0.85,
  },
  lights: {
    color1: { r: 0.8, g: 0.8, b: 1 },
    color2: { r: 0.8, g: 0.8, b: 1 },
    color3: { r: 0.8, g: 0.8, b: 1 },
  },
};

// Bass configuration
// const BASS_CONFIG = {
//   subBassIntensity: 0.4,
//   lowBassIntensity: 0.7,
//   lowMidIntensity: 0.8,
//   highMidIntensity: 0.9,
//   highIntensity: 1,
//   radiusMultiplier: 15,
//   radiusPower: 22,
//   particleScaleMax: 3,
//   roundnessMultiplier: 25,
//   lightIntensityMultiplier: 6,
//   rotationSpeedMax: 33,
//   enableColorShift: true,
//   subBassShakeIntensity: 20,
//   subBassRotationIntensity: 10,
//   subBassThreshold: 0.2,
//   subBassDecay: 0.05,
//   subBassAttack: 5,
// };
// test lowbass
const BASS_CONFIG = {
  subBassIntensity: 0.4,
  lowBassIntensity: 0.7,
  lowMidIntensity: 0.8,
  highMidIntensity: 0.9,
  highIntensity: 1,
  radiusMultiplier: 15,
  // radiusPower: 22,
  radiusPower: 22,
  particleScaleMax: 3,
  roundnessMultiplier: 19,
  lightIntensityMultiplier: 6,
  rotationSpeedMax: 33,
  enableColorShift: true,
  subBassShakeIntensity: 10,
  subBassRotationIntensity: 20,
  subBassThreshold: 0.2,
  subBassDecay: 0.05,
  subBassAttack: 5,
};

// Chromatic Aberration Configuration
const CHROMATIC_CONFIG = {
  modes: {
    SUBTLE: { max: 0.002, speed: 0.1, decay: 0.92 },
    NORMAL: { max: 0.005, speed: 0.3, decay: 0.88 },
    INTENSE: { max: 0.015, speed: 0.5, decay: 0.85 },
    GLITCH: { max: 0.03, speed: 0.8, decay: 0.8 },
  },
  bassHitMultiplier: 1.5, // Reduced from 3.0 to prevent extreme flashes
  edgeStrength: 3,
  distanceStrength: 2,
  panInfluence: 0.5,
  waveSpeed: 2.0,
  pulseSpeed: 0.1,
};

// Shooting Star Configuration
const SHOOTING_STAR_CONFIG = {
  enableStars: true,
  highMidThreshold: 0.6, // Threshold for triggering new shooting stars
  highFreqThreshold: 0.6, // Threshold for triggering new shooting stars
  combinedThreshold: 0.6, // Combined threshold for activation
  maxActiveStars: 2000, // Maximum number of active shooting stars
  starLength: 25, // Length of each shooting star trail
  starWidth: 0.5, // Width of shooting star
  starSpeed: 4000, // Speed of shooting star (units per second)
  starLifetime: 0.2, // Lifetime of each star in seconds
  baseOpacity: 1, // Starting opacity of shooting star
  fadeRate: 0.3, // How quickly stars fade as they age
  headFormationThreshold: 0.9, // Head must be fully formed
  spawnRate: 0.01, // Minimum time between spawns (seconds)
  headCenterY: 350, // Y position of head center
  headRadius: 75, // Head radius for spawn positioning
};

// Simple OBJ Loader function
function loadOBJ(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((response) => response.text())
      .then((text) => {
        const lines = text.split("\n");
        const vertices = [];
        const faces = [];

        lines.forEach((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts[0] === "v") {
            vertices.push({
              x: parseFloat(parts[1]),
              y: parseFloat(parts[2]),
              z: parseFloat(parts[3]),
            });
          } else if (parts[0] === "f") {
            const face = [];
            for (let i = 1; i < parts.length; i++) {
              const indices = parts[i].split("/");
              face.push(parseInt(indices[0]) - 1);
            }
            if (face.length >= 3) {
              faces.push(face);
            }
          }
        });

        resolve({ vertices, faces });
      })
      .catch(reject);
  });
}

// Helper function for Catmull-Rom spline
function catmullRom(p0, p1, p2, p3, t) {
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

// Camera Controller
class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.autoRotate = true;
    this.autoRotateSpeed = 0.1;
    this.rotationY = 0;
    this.targetDistance = 2000;
    this.distance = 2000;
    this.isDragging = false;
    this.previousMouseX = 0;
    this.previousMouseY = 0;
    this.spherical = new THREE.Spherical();
    this.minDistance = 50;
    this.maxDistance = 2000;
    this.minPolarAngle = Math.PI * 0.4;
    this.maxPolarAngle = Math.PI * 0.6;
    this.lastTime = performance.now();

    this.domElement.addEventListener("wheel", this.onWheel.bind(this));
    this.domElement.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.domElement.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.domElement.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.domElement.addEventListener("mouseleave", this.onMouseUp.bind(this));
  }

  onWheel(e) {
    e.preventDefault();
    this.targetDistance += e.deltaY * 0.5;
    this.targetDistance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.targetDistance),
    );
  }

  onMouseDown(e) {
    this.isDragging = true;
    this.previousMouseX = e.clientX;
    this.previousMouseY = e.clientY;
  }

  onMouseMove(e) {
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
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    if (this.autoRotate && !this.isDragging) {
      this.rotationY += this.autoRotateSpeed * deltaTime * 0.3;
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

// Audio Analyzer
class AudioAnalyzer {
  constructor(binCount = 1024, smoothingTimeConstant = 0.85) {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.analyzerNode = this.context.createAnalyser();
    this.analyzerNodeLeft = this.context.createAnalyser();
    this.analyzerNodeRight = this.context.createAnalyser();
    this.splitter = this.context.createChannelSplitter(2);
    this.merger = this.context.createChannelMerger(2);
    this.source = null;
    this.binCount = binCount;
    this.isConnected = false;
    this.setBinCount(binCount);
    this.setSmoothingTimeConstant(smoothingTimeConstant);
  }

  setBinCount(binCount) {
    this.binCount = binCount;
    this.analyzerNode.fftSize = binCount * 2;
    this.analyzerNodeLeft.fftSize = binCount * 2;
    this.analyzerNodeRight.fftSize = binCount * 2;
    this.frequencyByteData = new Uint8Array(binCount);
    this.frequencyByteDataLeft = new Uint8Array(binCount);
    this.frequencyByteDataRight = new Uint8Array(binCount);
    this.timeByteData = new Uint8Array(binCount);
  }

  setSmoothingTimeConstant(smoothingTimeConstant) {
    this.analyzerNode.smoothingTimeConstant = smoothingTimeConstant;
    this.analyzerNodeLeft.smoothingTimeConstant = smoothingTimeConstant;
    this.analyzerNodeRight.smoothingTimeConstant = smoothingTimeConstant;
  }

  async init(audioElement) {
    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      if (!this.source && !this.isConnected) {
        this.source = this.context.createMediaElementSource(audioElement);
        this.source.connect(this.splitter);
        this.splitter.connect(this.analyzerNodeLeft, 0);
        this.splitter.connect(this.analyzerNodeRight, 1);
        this.analyzerNodeLeft.connect(this.merger, 0, 0);
        this.analyzerNodeRight.connect(this.merger, 0, 1);
        this.source.connect(this.analyzerNode);
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

  getFrequencyDataSubBass() {
    return this.frequencyByteData;
  }

  updateSample() {
    this.analyzerNode.getByteFrequencyData(this.frequencyByteData);
    this.analyzerNodeLeft.getByteFrequencyData(this.frequencyByteDataLeft);
    this.analyzerNodeRight.getByteFrequencyData(this.frequencyByteDataRight);
    this.analyzerNode.getByteTimeDomainData(this.timeByteData);
  }
}

const AudioVisualizerWithObject = () => {
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const sceneRef = useRef(null);
  const composerRef = useRef(null);
  const frameId = useRef();
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [debugInfo, setDebugInfo] = useState("Loading...");
  const isPlayingRef = useRef(false);

  const pathLength = 256;
  const particleCount = 77777;
  const prefabDelay = 0.00015;
  const vertexDelay = 0.0075;
  const minDuration = 40;
  const maxDuration = 600;

  const animState = useRef({
    time: 0,
    noiseOffset: 0,
    randomSeed: Math.random() * 1000,
    previousBassAvg: 0,
    bassHitTime: 0,
    shakePhase: 0,
    rotationPhase: 0,
    subBassPeak: 0,
    subBassPeakTime: 0,
    lastFrameTime: performance.now(),
    // Chromatic aberration state
    chromaticStrength: 0,
    chromaticTargetStrength: 0,
    chromaticMode: "SUBTLE",
    chromaticDirection: new THREE.Vector2(0, 0),
    chromaticWavePhase: 0,
    chromaticPulsePhase: 0,
    lastBassHitTime: 0,
    overallEnergy: 0,
    // Shooting star state
    lastStarSpawnTime: 0,
    headFormationProgress: 0,
    // Particle scaling state
    currentParticleScale: 1.0,
    // Chromatic aberration tracer state
    chromaticTracer: 0,
    chromaticTracerStartTime: 0,
    chromaticTracerActive: false,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    console.log(
      "Initializing head-shaped particle system with chromatic aberration...",
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
    camera.position.set(0, 0, 1200);

    // Renderer with post-processing support
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    containerRef.current.appendChild(renderer.domElement);

    // Create render targets for chromatic aberration
    const renderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    };

    const renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      renderTargetOptions,
    );

    // Create chromatic aberration shader
    const chromaticAberrationShader = {
      uniforms: {
        tDiffuse: { value: null },
        uChromaticStrength: { value: 0.0 },
        uChromaticDirection: { value: new THREE.Vector2(1.0, 0.0) },
        uScreenSize: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        uTime: { value: 0 },
        uWavePhase: { value: 0 },
        uEdgeStrength: { value: CHROMATIC_CONFIG.edgeStrength },
        uDistanceStrength: { value: CHROMATIC_CONFIG.distanceStrength },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uChromaticStrength;
        uniform vec2 uChromaticDirection;
        uniform vec2 uScreenSize;
        uniform float uTime;
        uniform float uWavePhase;
        uniform float uEdgeStrength;
        uniform float uDistanceStrength;
        
        varying vec2 vUv;
        
        void main() {
          vec2 center = vec2(0.5, 0.5);
          vec2 toCenter = vUv - center;
          float distFromCenter = length(toCenter);
          
          // Edge enhancement
          float edgeFactor = smoothstep(0.0, 0.7, distFromCenter) * uEdgeStrength;
          
          // Distance-based strength
          float distanceFactor = distFromCenter * uDistanceStrength;
          
          // Wave distortion for dynamic effect
          float wave = sin(distFromCenter * 10.0 + uWavePhase) * 0.1;
          
          // Calculate aberration direction (influenced by audio pan and natural lens behavior)
          vec2 aberrationDir = normalize(toCenter + uChromaticDirection * 0.5);
          
          // Total aberration strength
          float totalStrength = uChromaticStrength * (1.0 + edgeFactor + distanceFactor + wave);
          
          // Different offsets for each channel (red leads, blue lags)
          vec2 redOffset = aberrationDir * totalStrength * 1.2;
          vec2 greenOffset = aberrationDir * totalStrength * 0.0; // Green stays centered
          vec2 blueOffset = -aberrationDir * totalStrength * 0.8;
          
          // Add slight scale differences between channels for more realistic effect
          float redScale = 1.0 + totalStrength * 0.01;
          float blueScale = 1.0 - totalStrength * 0.01;
          
          vec2 redUv = (vUv - center) * redScale + center + redOffset;
          vec2 greenUv = vUv + greenOffset;
          vec2 blueUv = (vUv - center) * blueScale + center + blueOffset;
          
          // Sample each channel separately
          float r = texture2D(tDiffuse, redUv).r;
          float g = texture2D(tDiffuse, greenUv).g;
          float b = texture2D(tDiffuse, blueUv).b;
          
          // Slight desaturation at high aberration for artistic effect
          vec3 color = vec3(r, g, b);
          float lum = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(color, vec3(lum), totalStrength * 0.1);
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    };

    // Create post-processing quad
    const postQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial(chromaticAberrationShader),
    );
    const postScene = new THREE.Scene();
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postScene.add(postQuad);

    const controls = new CameraController(camera, renderer.domElement);

    // Lights
    const light1 = new THREE.PointLight(0xadd8e6, 0.25, 1200, 2);
    light1.position.set(0, 0, 0);
    light1.color.setRGB(
      PARTICLE_COLOR.lights.color1.r,
      PARTICLE_COLOR.lights.color1.g,
      PARTICLE_COLOR.lights.color1.b,
    );
    scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xadd8e6, 0.25);
    light2.position.set(0, 1, 1);
    light2.color.setRGB(
      PARTICLE_COLOR.lights.color2.r,
      PARTICLE_COLOR.lights.color2.g,
      PARTICLE_COLOR.lights.color2.b,
    );
    scene.add(light2);

    const light3 = new THREE.DirectionalLight(0xadd8e6, 0.25);
    light3.position.set(0, 1, -1);
    light3.color.setRGB(
      PARTICLE_COLOR.lights.color3.r,
      PARTICLE_COLOR.lights.color3.g,
      PARTICLE_COLOR.lights.color3.b,
    );
    scene.add(light3);

    // Create shooting star system
    const shootingStars = [];
    const starGeometry = new THREE.CylinderGeometry(
      0.1, // Tip radius (very thin)
      SHOOTING_STAR_CONFIG.starWidth, // Base radius
      SHOOTING_STAR_CONFIG.starLength, // Length
      6, // Radial segments
      1, // Height segments
      false, // Open ended
    );

    // Create shooting star pool for reuse
    for (let i = 0; i < SHOOTING_STAR_CONFIG.maxActiveStars; i++) {
      const starMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        fog: false,
        blending: THREE.AdditiveBlending,
      });

      const starMesh = new THREE.Mesh(starGeometry, starMaterial);
      starMesh.visible = false; // Start invisible
      scene.add(starMesh);

      // Initialize shooting star data
      const shootingStar = {
        mesh: starMesh,
        material: starMaterial,
        active: false,
        age: 0,
        lifetime: 0,
        startPosition: { x: 0, y: 0, z: 0 },
        currentPosition: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 0 },
        speed: 0,
        intensity: 0,
        baseIntensity: Math.random() * 0.3 + 0.7, // Random base intensity
      };

      shootingStars.push(shootingStar);
    }

    // Create path positions array (complex spiral path like original)
    const pathPositions = new Float32Array(pathLength * 3);
    const radiusArray = new Float32Array(pathLength);
    const shakeArray = new Float32Array(pathLength * 3);
    const rotationArray = new Float32Array(pathLength);
    const panArray = new Float32Array(pathLength);

    // Create the original complex path
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
    }

    // Load OBJ and create particles
    loadOBJ("/assets/objs/femalehead.obj")
      .then((objData) => {
        console.log("OBJ loaded, creating particle system...");

        // Transform and scale vertices
        const headScale = 15;
        const headOffsetY = 350;
        const headRotationX = -Math.PI / 2.5 + (-15 * Math.PI) / 180;

        // Sample points from the head surface
        const headPoints = [];
        const totalFaces = objData.faces.length;
        const pointsPerFace = Math.ceil(particleCount / totalFaces);

        objData.faces.forEach((face, faceIndex) => {
          if (headPoints.length >= particleCount) return;

          // Get vertices of the face
          const v1 = objData.vertices[face[0]];
          const v2 = objData.vertices[face[1]];
          const v3 = objData.vertices[face[2]];

          // Sample random points on the triangle
          const numSamples = Math.min(
            pointsPerFace,
            particleCount - headPoints.length,
          );
          for (let i = 0; i < numSamples; i++) {
            // Random barycentric coordinates
            let r1 = Math.random();
            let r2 = Math.random();
            if (r1 + r2 > 1) {
              r1 = 1 - r1;
              r2 = 1 - r2;
            }
            const r3 = 1 - r1 - r2;

            // Interpolate position
            let x = v1.x * r1 + v2.x * r2 + v3.x * r3;
            let y = v1.y * r1 + v2.y * r2 + v3.y * r3;
            let z = v1.z * r1 + v2.z * r2 + v3.z * r3;

            // Apply transformations
            const rotatedX = x;
            const rotatedY =
              y * Math.cos(headRotationX) - z * Math.sin(headRotationX);
            const rotatedZ =
              y * Math.sin(headRotationX) + z * Math.cos(headRotationX);

            headPoints.push({
              x: rotatedX * headScale,
              y: rotatedY * headScale + headOffsetY,
              z: rotatedZ * headScale,
            });
          }
        });

        // Create prefab geometry (sphere)
        const prefabGeometry = new THREE.SphereGeometry(2, 4, 4);
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
        const headPositions = new Float32Array(totalVertices * 3);
        const indices = new Uint32Array(totalIndices);

        for (let i = 0; i < particleCount; i++) {
          const delay = i * prefabDelay;
          const duration =
            minDuration + Math.random() * (maxDuration - minDuration);
          const pivot = new THREE.Vector3(
            Math.random() * 2,
            Math.random() * 2,
            Math.random() * 2,
          );
          const axis = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
          ).normalize();
          const angle = Math.PI * (12 + Math.random() * 12);

          const headPoint = headPoints[i % headPoints.length];

          for (let j = 0; j < verticesPerPrefab; j++) {
            const vertexIndex = i * verticesPerPrefab + j;
            positions[vertexIndex * 3] = prefabPositions.getX(j);
            positions[vertexIndex * 3 + 1] = prefabPositions.getY(j);
            positions[vertexIndex * 3 + 2] = prefabPositions.getZ(j);
            normals[vertexIndex * 3] = prefabNormals.getX(j);
            normals[vertexIndex * 3 + 1] = prefabNormals.getY(j);
            normals[vertexIndex * 3 + 2] = prefabNormals.getZ(j);
            colors[vertexIndex * 3] = PARTICLE_COLOR.r;
            colors[vertexIndex * 3 + 1] = PARTICLE_COLOR.g;
            colors[vertexIndex * 3 + 2] = PARTICLE_COLOR.b;
            delayDurations[vertexIndex * 2] = delay + j * vertexDelay;
            delayDurations[vertexIndex * 2 + 1] = duration;
            pivots[vertexIndex * 3] = pivot.x;
            pivots[vertexIndex * 3 + 1] = pivot.y;
            pivots[vertexIndex * 3 + 2] = pivot.z;
            axisAngles[vertexIndex * 4] = axis.x;
            axisAngles[vertexIndex * 4 + 1] = axis.y;
            axisAngles[vertexIndex * 4 + 2] = axis.z;
            axisAngles[vertexIndex * 4 + 3] = angle;
            headPositions[vertexIndex * 3] = headPoint.x;
            headPositions[vertexIndex * 3 + 1] = headPoint.y;
            headPositions[vertexIndex * 3 + 2] = headPoint.z;
          }

          if (prefabIndices) {
            for (let j = 0; j < indicesPerPrefab; j++) {
              indices[i * indicesPerPrefab + j] =
                prefabIndices.getX(j) + i * verticesPerPrefab;
            }
          }
        }

        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3),
        );
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
        geometry.setAttribute(
          "aHeadPosition",
          new THREE.BufferAttribute(headPositions, 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Vertex shader - now properly uses the complex path and converges to head
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

        attribute vec2 aDelayDuration;
        attribute vec3 aPivot;
        attribute vec4 aAxisAngle;
        attribute vec3 aHeadPosition;

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

          vec3 objectNormal = normal;
          objectNormal = rotateVector(tQuat, objectNormal);

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

          vec3 s0 = uShake[i0];
          vec3 s1 = uShake[i1];
          vec3 s2 = uShake[i2];
          vec3 s3 = uShake[i3];
          vec3 shake = catmullRomShake(s0, s1, s2, s3, tWeight);

          float rotation = catmullRom(uRotation[i0], uRotation[i1], uRotation[i2], uRotation[i3], tWeight);
          float pan = catmullRom(uPan[i0], uPan[i1], uPan[i2], uPan[i3], tWeight);
          float radius = catmullRom(uRadius[i0], uRadius[i1], uRadius[i2], uRadius[i3], tWeight);

          float particleAngle = atan(aPivot.z, aPivot.x);
          float panEffect = 1.0 + pan * cos(particleAngle) * 0.5;
          radius *= panEffect;

          transformed += aPivot * radius;

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

          // Get base position from the complex path
          vec3 basePosition = catmullRom(p0, p1, p2, p3, uRoundness, tWeight);

          // Calculate head influence - stronger at the end of the path
          float headInfluence = smoothstep(0.6, 0.95, tProgress);

          // Blend between the path position and head position
          vec3 targetHeadPos = aHeadPosition;
          basePosition = mix(basePosition, targetHeadPos, headInfluence);

          // Reduce the radius influence as particles approach head shape
          float radiusReduction = 1.0 - headInfluence * 0.7;
          transformed *= radiusReduction;

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

          vec3 lightDir1 = normalize(uLightPos1 - vWorldPosition);
          float diff1 = max(dot(normal, lightDir1), 0.0);
          float distance1 = length(uLightPos1 - vWorldPosition);
          float attenuation1 = 1.0 / (1.0 + 0.001 * distance1 + 0.0001 * distance1 * distance1);
          finalColor += vColor * uLightColor1 * diff1 * uLightIntensity1 * attenuation1;

          vec3 lightDir2 = normalize(uLightPos2);
          float diff2 = max(dot(normal, lightDir2), 0.0);
          finalColor += vColor * uLightColor2 * diff2 * uLightIntensity2;

          vec3 lightDir3 = normalize(uLightPos3);
          float diff3 = max(dot(normal, lightDir3), 0.0);
          finalColor += vColor * uLightColor3 * diff3 * uLightIntensity3;

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
          // Post-processing references
          renderTarget,
          postScene,
          postCamera,
          postQuad,
          chromaticShader: chromaticAberrationShader,
          // Shooting star references
          shootingStars,
        };

        setDebugInfo("Ready to play");
        console.log(
          "Head-shaped particle system with chromatic aberration ready",
        );
      })
      .catch((error) => {
        console.error("Error loading OBJ:", error);
        setDebugInfo("Error loading model");
      });

    // Animation loop
    let frameCount = 0;
    const animate = () => {
      frameId.current = requestAnimationFrame(animate);

      const currentTime = performance.now();
      const deltaTime = (currentTime - animState.current.lastFrameTime) / 1000;
      animState.current.lastFrameTime = currentTime;

      if (!sceneRef.current) return;

      const {
        camera,
        renderer,
        scene,
        controls,
        particles,
        pathPositions,
        radiusArray,
        shakeArray,
        rotationArray,
        panArray,
        renderTarget,
        postScene,
        postCamera,
        postQuad,
        chromaticShader,
      } = sceneRef.current;
      const anim = animState.current;

      controls.update();

      anim.time = audioRef.current?.currentTime || 0;
      if (particles && particles.material && particles.material.uniforms) {
        particles.material.uniforms.uTime.value = anim.time;
      }

      anim.shakePhase += 0.3 * deltaTime * 60;
      anim.rotationPhase += 0.02 * deltaTime * 60;
      anim.noiseOffset += 0.01 * deltaTime * 60;

      // Update chromatic aberration wave and pulse phases
      anim.chromaticWavePhase += CHROMATIC_CONFIG.waveSpeed * deltaTime;
      anim.chromaticPulsePhase += CHROMATIC_CONFIG.pulseSpeed * deltaTime;

      // Audio processing (same as original)
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
        const dataSubBass = sceneRef.current.analyzer.getFrequencyDataSubBass();
        const dataArray = [];
        const cap = data.length * 0.5;

        anim.noiseOffset += 0.01;

        // Calculate frequency bands
        const sampleRate = 44100;
        const binHz = sampleRate / (sceneRef.current.analyzer.binCount * 2);
        const subBassEnd = Math.floor(250 / binHz);
        const lowBassEnd = Math.floor(400 / binHz);
        const lowMidEnd = Math.floor(1500 / binHz);
        const highMidEnd = Math.floor(3000 / binHz);

        // Calculate averages for each band
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

        for (let i = 0; i < subBassEnd; i++) {
          subBassTotal += dataSubBass[i];
          subBassLeft += dataLeft[i];
          subBassRight += dataRight[i];
        }
        let subBassAvg =
          (subBassTotal / Math.max(1, subBassEnd) / 255) *
          BASS_CONFIG.subBassIntensity;
        let subBassLeftAvg = subBassLeft / Math.max(1, subBassEnd) / 255;
        let subBassRightAvg = subBassRight / Math.max(1, subBassEnd) / 255;

        for (let i = subBassEnd; i < lowBassEnd; i++) {
          lowBassTotal += data[i];
          lowBassLeft += dataLeft[i];
          lowBassRight += dataRight[i];
        }
        let lowBassAvg =
          (lowBassTotal / Math.max(1, lowBassEnd - subBassEnd) / 255) *
          BASS_CONFIG.lowBassIntensity;
        let lowBassLeftAvg =
          lowBassLeft / Math.max(1, lowBassEnd - subBassEnd) / 255;
        let lowBassRightAvg =
          lowBassRight / Math.max(1, lowBassEnd - subBassEnd) / 255;

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

        // Calculate stereo pan
        const calculatePan = (left, right) => {
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

        // Bass hit detection
        const subBassPeak = animState.current.subBassPeak || 0;
        const subBassPeakTime = animState.current.subBassPeakTime || 0;
        const now = Date.now();
        let isBassHit = false;

        // DO SOMETHING IF BASS HIT
        if (
          subBassAvg > BASS_CONFIG.subBassThreshold &&
          subBassAvg > anim.previousBassAvg * 1.1 &&
          now - subBassPeakTime > 150
        ) {
          isBassHit = true;
        }

        anim.previousBassAvg = subBassAvg;
        subBassAvg = Math.max(subBassAvg, animState.current.subBassPeak);

        // Calculate overall energy for chromatic aberration
        const overallEnergy =
          subBassAvg * 0.3 +
          lowBassAvg * 0.2 +
          lowMidAvg * 0.2 +
          highMidAvg * 0.15 +
          highAvg * 0.15;
        anim.overallEnergy = overallEnergy;

        // CHROMATIC ABERRATION LOGIC
        // Determine mode based on audio analysis
        let targetMode = "SUBTLE";
        if (isBassHit) {
          targetMode = "GLITCH";
        } else if (subBassAvg > 0.9) {
          targetMode = "GLITCH";
        } else if (subBassAvg > 0.5) {
          targetMode = "INTENSE";
        } else if (overallEnergy > 0.6) {
          targetMode = "NORMAL";
        } else {
          targetMode = "SUBTLE";
        }
        anim.chromaticMode = targetMode;


        // Calculate target chromatic strength
        const modeConfig = CHROMATIC_CONFIG.modes[targetMode];
        let targetStrength = 0;

        if (isBassHit) {
          // Massive spike on bass hit
          targetStrength = modeConfig.max * CHROMATIC_CONFIG.bassHitMultiplier;
        } else {
          // Base strength from sub-bass
          targetStrength = subBassAvg * modeConfig.max;

          // Add overall energy influence
          targetStrength += overallEnergy * modeConfig.max * 0.3;

          // Clamp to mode maximum
          targetStrength = Math.min(targetStrength, modeConfig.max);
        }

        // Add pulse effect during calm sections
        if (targetMode === "SUBTLE" || targetMode === "NORMAL") {
          const pulse = Math.sin(anim.chromaticPulsePhase) * 0.5 + 0.5;
          targetStrength += pulse * modeConfig.max * 0.2;
        }

        anim.chromaticTargetStrength = targetStrength;

        // Detect chromatic spike for tracer effect
        if (isBassHit && !anim.chromaticTracerActive) {
          // Trigger chromatic tracer on bass hit
          anim.chromaticTracerActive = true;
          anim.chromaticTracer = targetStrength * 0.8; // Start tracer at 80% of peak strength
          anim.chromaticTracerStartTime = anim.time;
        }

        // Update chromatic tracer fade out (500ms)
        if (anim.chromaticTracerActive) {
          const tracerAge = anim.time - anim.chromaticTracerStartTime;
          if (tracerAge >= 0.5) {
            // Tracer has lived for 500ms, deactivate
            anim.chromaticTracerActive = false;
            anim.chromaticTracer = 0;
          } else {
            // Exponential fade out over 500ms
            anim.chromaticTracer *= 0.92; // Smooth fade
          }
        }

        // Smooth transition to target strength with more smoothing on bass hits
        const decayRate = isBassHit ? 0.98 : modeConfig.decay;
        const smoothingRate = isBassHit ? 0.15 : 1 - decayRate;
        anim.chromaticStrength +=
          (anim.chromaticTargetStrength - anim.chromaticStrength) *
          smoothingRate;

        // Add tracer to final chromatic strength
        const finalChromaticStrength =
          anim.chromaticStrength + anim.chromaticTracer;

        // Calculate chromatic direction based on stereo field
        const panX = subBassPan * CHROMATIC_CONFIG.panInfluence * subBassAvg;
        const panY = (highAvg - lowBassAvg) * 0.3; // Vertical based on frequency distribution

        // Add some randomness on bass hits
        if (isBassHit) {
          anim.chromaticDirection.x = panX + (Math.random() - 0.5) * 0.5;
          anim.chromaticDirection.y = panY + (Math.random() - 0.5) * 0.5;
        } else {
          // Smooth transition
          anim.chromaticDirection.x += (panX - anim.chromaticDirection.x) * 0.1;
          anim.chromaticDirection.y += (panY - anim.chromaticDirection.y) * 0.1;
        }

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

        // Update camera rotation speed based on sub-bass
        let rotSpeed = 2.0 + subBassAvg * BASS_CONFIG.rotationSpeedMax;
        rotSpeed += Math.sin(anim.noiseOffset * 0.7) * 0.5;
        if (Date.now() - anim.bassHitTime < 500) {
          rotSpeed += (Math.random() - 0.5) * 3;
        }
        controls.autoRotateSpeed = rotSpeed;

        // Complex radius calculation
        const currentTimeVal = audioRef.current.currentTime || 0;

        // Calculate head formation progress based on current particle timing
        let maxHeadProgress = 0;
        for (let i = 0; i < 1000; i += 10) {
          // Sample some particles
          const delay = i * prefabDelay;
          const duration =
            minDuration + Math.random() * (maxDuration - minDuration);
          const timeInPath = currentTimeVal - delay;
          const progress = Math.min(1.0, Math.max(0.0, timeInPath / duration));
          if (progress > maxHeadProgress) maxHeadProgress = progress;
        }
        anim.headFormationProgress = maxHeadProgress;

        // Check if head is sufficiently formed for shooting star effects
        const headIsFormed =
          anim.headFormationProgress >=
          SHOOTING_STAR_CONFIG.headFormationThreshold;

        // SHOOTING STAR LOGIC - Only when head is formed
        if (SHOOTING_STAR_CONFIG.enableStars && headIsFormed) {
          // Calculate combined audio intensity for star spawning
          const combinedAudioIntensity = highMidAvg * 0.6 + highAvg * 0.4;
          const hasHighMidEnergy =
            highMidAvg >= SHOOTING_STAR_CONFIG.highMidThreshold;
          const hasHighFreqEnergy =
            highAvg >= SHOOTING_STAR_CONFIG.highFreqThreshold;
          const hasCombinedEnergy =
            combinedAudioIntensity >= SHOOTING_STAR_CONFIG.combinedThreshold;

          // Check if we should spawn new shooting stars
          const shouldSpawnStar =
            (hasHighMidEnergy || hasHighFreqEnergy) && hasCombinedEnergy;
          const timeSinceLastSpawn = anim.time - anim.lastStarSpawnTime;

          if (
            shouldSpawnStar &&
            timeSinceLastSpawn >= SHOOTING_STAR_CONFIG.spawnRate
          ) {
            // Find inactive shooting star to reuse
            const inactiveStar = sceneRef.current.shootingStars.find(
              (star) => !star.active,
            );

            if (inactiveStar) {
              // Calculate random spawn position on head surface (upper hemisphere)
              const phi = Math.acos(Math.random() * 0.8 + 0.2); // Bias toward top
              const theta = Math.random() * Math.PI * 2;

              const headRadius = SHOOTING_STAR_CONFIG.headRadius;
              const spawnX = Math.sin(phi) * Math.cos(theta) * headRadius;
              const spawnY =
                SHOOTING_STAR_CONFIG.headCenterY + Math.cos(phi) * headRadius;
              const spawnZ = Math.sin(phi) * Math.sin(theta) * headRadius;

              // Calculate outward direction (normalized)
              const dirLength = Math.sqrt(
                spawnX * spawnX +
                  (spawnY - SHOOTING_STAR_CONFIG.headCenterY) *
                    (spawnY - SHOOTING_STAR_CONFIG.headCenterY) +
                  spawnZ * spawnZ,
              );

              // Initialize shooting star
              inactiveStar.active = true;
              inactiveStar.age = 0;
              inactiveStar.lifetime =
                SHOOTING_STAR_CONFIG.starLifetime * (0.7 + Math.random() * 0.6); // Vary lifetime
              inactiveStar.startPosition = { x: spawnX, y: spawnY, z: spawnZ };
              inactiveStar.currentPosition = {
                x: spawnX,
                y: spawnY,
                z: spawnZ,
              };
              inactiveStar.direction = {
                x: spawnX / dirLength,
                y: (spawnY - SHOOTING_STAR_CONFIG.headCenterY) / dirLength,
                z: spawnZ / dirLength,
              };
              inactiveStar.speed =
                SHOOTING_STAR_CONFIG.starSpeed *
                (0.8 + combinedAudioIntensity * 0.4);
              inactiveStar.intensity =
                combinedAudioIntensity * inactiveStar.baseIntensity;

              // Position and orient the mesh
              inactiveStar.mesh.position.set(spawnX, spawnY, spawnZ);
              inactiveStar.mesh.lookAt(
                spawnX + inactiveStar.direction.x,
                spawnY + inactiveStar.direction.y,
                spawnZ + inactiveStar.direction.z,
              );
              inactiveStar.mesh.rotateX(Math.PI / 2); // Align cylinder with direction
              inactiveStar.mesh.visible = true;

              anim.lastStarSpawnTime = anim.time;
            }
          }
        }

        let minVisibleProgress = 1.0;
        let maxVisibleProgress = 0.0;
        let avgDuration = 170;
        avgDuration += Math.sin(anim.noiseOffset * 0.5) * 10;

        for (let i = 0; i < cap; i++) {
          const segmentDelay = i * prefabDelay;
          const timeInPath = currentTimeVal - segmentDelay;
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
          maxVisibleProgress = 0.5;
        }

        const visibleRange = maxVisibleProgress - minVisibleProgress;
        const sectionSize = visibleRange / 5;
        const subBassThreshold = minVisibleProgress + sectionSize;
        const lowBassThreshold = minVisibleProgress + sectionSize * 2;
        const lowMidThreshold = minVisibleProgress + sectionSize * 3;
        const highMidThreshold = minVisibleProgress + sectionSize * 4;

        // Clear arrays
        for (let i = 0; i < pathLength; i++) {
          shakeArray[i * 3] = 0;
          shakeArray[i * 3 + 1] = 0;
          shakeArray[i * 3 + 2] = 0;
          rotationArray[i] = 0;
          panArray[i] = 0;
          radiusArray[i] *= BASS_CONFIG.subBassDecay;
        }

        // Apply sub-bass rotation to all path points
        if (subBassAvg > 0.03) {
          const peakFactor = subBassPeak * 5.0 + 1.5;
          for (let i = 0; i < pathLength; i++) {
            const rotationBase = Math.sin(anim.rotationPhase + i * 0.1);
            const rotationIntensity =
              (subBassAvg * 1.5 + subBassPeak * 3.0) *
              BASS_CONFIG.subBassRotationIntensity *
              peakFactor;
            rotationArray[i] = rotationBase * rotationIntensity;
            if (isBassHit) {
              rotationArray[i] *= 3.0;
            }
          }
        }

        // Process frequency data
        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < cap; i++) {
            let idx = pass === 1 ? cap - 1 - i : i;
            const segmentDelay = (pass < 2 ? i : i + cap) * prefabDelay;
            const timeInPath = currentTimeVal - segmentDelay;
            const progressAlongPath = Math.min(
              1.0,
              Math.max(0.0, timeInPath / avgDuration),
            );

            let weight = 1.0;
            let freqValue = 0;
            let isInSubBassSection = false;
            let currentFreqAvg = 0;

            if (progressAlongPath <= subBassThreshold || timeInPath <= 0) {
              isInSubBassSection = true;
              currentFreqAvg = subBassAvg;
              weight = 1.8 + subBassAvg * 4.0;
              weight += (Math.random() - 0.5) * 0.3;
              if (idx < subBassEnd) {
                freqValue = dataSubBass[idx] * weight;
              } else {
                freqValue = subBassAvg * 255 * weight * 0.6;
              }
              if (isBassHit && Math.random() > 0.7) {
                freqValue *= BASS_CONFIG.subBassAttack;
              }
            } else if (progressAlongPath < lowBassThreshold) {
              currentFreqAvg = lowBassAvg;
              weight = 1.5 + lowBassAvg * 3.0;
              weight += (Math.random() - 0.5) * 0.25;
              if (idx >= subBassEnd && idx < lowBassEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = lowBassAvg * 255 * weight * 0.65;
              }
            } else if (progressAlongPath < lowMidThreshold) {
              currentFreqAvg = lowMidAvg;
              weight = 1.2 + lowMidAvg * 2.0;
              weight += (Math.random() - 0.5) * 0.2;
              if (idx >= lowBassEnd && idx < lowMidEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = lowMidAvg * 255 * weight * 0.7;
              }
            } else if (progressAlongPath < highMidThreshold) {
              currentFreqAvg = highMidAvg;
              weight = 1.0 + highMidAvg * 1.5;
              weight += (Math.random() - 0.5) * 0.15;
              if (idx >= lowMidEnd && idx < highMidEnd) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = highMidAvg * 255 * weight * 0.75;
              }
            } else {
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

            if (i < pathLength) {
              const pathIndex = Math.floor(
                progressAlongPath * (pathLength - 1),
              );
              if (pathIndex >= 0 && pathIndex < pathLength) {
                if (isInSubBassSection && subBassAvg > 0.03) {
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
                  panArray[pathIndex] = subBassPan * subBassAvg;

                  if (isBassHit) {
                    shakeArray[pathIndex * 3] *= 1.5;
                    shakeArray[pathIndex * 3 + 1] *= 1.5;
                    shakeArray[pathIndex * 3 + 2] *= 1.5;
                  }
                } else if (progressAlongPath < lowBassThreshold) {
                  panArray[pathIndex] = lowBassPan * lowBassAvg;
                } else if (progressAlongPath < lowMidThreshold) {
                  panArray[pathIndex] = lowMidPan * lowMidAvg;
                } else if (progressAlongPath < highMidThreshold) {
                  panArray[pathIndex] = highMidPan * highMidAvg;
                } else {
                  panArray[pathIndex] = highPan * highAvg;
                }
              }
            }
          }
        }

        // Update radius array
        for (let i = 0; i < pathLength; i++) {
          if (i < dataArray.length) {
            let val = dataArray[i] / 255;
            val += Math.sin(anim.noiseOffset * 4 + i * 0.2) * 0.02;
            val = Math.max(0, Math.min(1, val));
            let baseRadius =
              Math.pow(val, BASS_CONFIG.radiusPower) *
              BASS_CONFIG.radiusMultiplier;
            baseRadius += (Math.random() - 0.5) * 2;
            const pathProgress = i / (pathLength - 1);
            if (pathProgress <= 0.2) {
              baseRadius += subBassAvg * subBassAvg * 120;
              if (isBassHit && Math.random() > 0.6) {
                baseRadius *= BASS_CONFIG.subBassAttack;
              }
            }
            radiusArray[i] = Math.max(1, baseRadius);
          } else {
            const pathProgress = i / (pathLength - 1);
            let sectionAvg = 0;
            if (pathProgress <= 0.2) {
              sectionAvg = subBassAvg;
            } else if (pathProgress <= 0.4) {
              sectionAvg = lowBassAvg;
            } else if (pathProgress <= 0.6) {
              sectionAvg = lowMidAvg;
            } else if (pathProgress <= 0.8) {
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
        if (particles && particles.material && particles.material.uniforms) {
          const r =
            BASS_CONFIG.roundnessMultiplier * Math.pow(subBassAvg, 2) + 1;
          particles.material.uniforms.uRoundness.value.set(
            r + Math.sin(anim.noiseOffset * 3) * 0.5,
            r + Math.sin(anim.noiseOffset * 3) * 0.5,
          );
          const bassParticleScale =
            1.0 + subBassAvg * (BASS_CONFIG.particleScaleMax - 1.0) * 1.5;
          const overallEnergy =
            subBassAvg * 0.3 +
            lowBassAvg * 0.2 +
            lowMidAvg * 0.2 +
            highMidAvg * 0.15 +
            highAvg * 0.15;
          let targetParticleScale =
            1.0 + overallEnergy * (BASS_CONFIG.particleScaleMax - 1.0);
          targetParticleScale = Math.max(
            targetParticleScale,
            bassParticleScale,
          );
          targetParticleScale +=
            Math.sin(anim.noiseOffset * 5 + anim.randomSeed) * 0.05;

          // Smooth the particle scale transition
          const smoothingFactor = 0.25; // Higher = less smoothing
          anim.currentParticleScale +=
            (targetParticleScale - anim.currentParticleScale) * smoothingFactor;

          particles.material.uniforms.uParticleScale.value =
            anim.currentParticleScale;
          particles.material.uniforms.uPath.value = pathPositions;
          particles.material.uniforms.uRadius.value = radiusArray;
          particles.material.uniforms.uShake.value = shakeArray;
          particles.material.uniforms.uRotation.value = rotationArray;
          particles.material.uniforms.uPan.value = panArray;
          particles.material.uniforms.uPath.needsUpdate = true;
          particles.material.uniforms.uRadius.needsUpdate = true;
          particles.material.uniforms.uShake.needsUpdate = true;
          particles.material.uniforms.uRotation.needsUpdate = true;
          particles.material.uniforms.uPan.needsUpdate = true;
        }

        // Update lights
        const { lights } = sceneRef.current;
        const lightIntensity =
          subBassAvg * BASS_CONFIG.lightIntensityMultiplier;
        const flicker = isBassHit
          ? 0.8 + Math.random() * 0.4
          : 0.9 + Math.random() * 0.1;
        lights.light1.intensity = Math.pow(lightIntensity, 2) * flicker;
        lights.light2.intensity =
          Math.pow(lightIntensity, 3) * 0.5 * (0.9 + Math.random() * 0.1);
        lights.light3.intensity =
          Math.pow(lightIntensity, 3) * 0.5 * (0.9 + Math.random() * 0.1);

        if (particles && particles.material && particles.material.uniforms) {
          particles.material.uniforms.uLightIntensity1.value =
            lights.light1.intensity;
          particles.material.uniforms.uLightIntensity2.value =
            lights.light2.intensity;
          particles.material.uniforms.uLightIntensity3.value =
            lights.light3.intensity;

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

        // Update shooting stars - animate movement and lifecycle
        if (sceneRef.current.shootingStars) {
          sceneRef.current.shootingStars.forEach((star) => {
            if (star.active) {
              // Age the star
              star.age += deltaTime;

              // Calculate age ratio for fading
              const ageRatio = star.age / star.lifetime;

              if (ageRatio >= 1.0) {
                // Star has reached end of life - deactivate
                star.active = false;
                star.mesh.visible = false;
              } else {
                // Update star position - move along direction
                const distance = star.speed * deltaTime;
                star.currentPosition.x += star.direction.x * distance;
                star.currentPosition.y += star.direction.y * distance;
                star.currentPosition.z += star.direction.z * distance;

                // Update mesh position
                star.mesh.position.set(
                  star.currentPosition.x,
                  star.currentPosition.y,
                  star.currentPosition.z,
                );

                // Calculate opacity with fade out over lifetime
                const fadeProgress = Math.pow(
                  1.0 - ageRatio,
                  SHOOTING_STAR_CONFIG.fadeRate,
                );
                const currentOpacity =
                  SHOOTING_STAR_CONFIG.baseOpacity *
                  star.intensity *
                  fadeProgress;
                star.material.opacity = Math.max(0, currentOpacity);

                // Dynamic scaling based on age and audio
                const sizeMultiplier = 1.0 + (1.0 - ageRatio) * 0.3; // Start bigger, shrink
                const audioScale = 1.0 + (highMidAvg + highAvg) * 0.2;
                star.mesh.scale.set(
                  sizeMultiplier * audioScale,
                  1.0 + star.intensity * 0.5,
                  sizeMultiplier * audioScale,
                );
              }
            }
          });
        }

        if (frameCount % 30 === 0) {
          const chromaticPercent = (
            (anim.chromaticStrength / CHROMATIC_CONFIG.modes.GLITCH.max) *
            100
          ).toFixed(0);
          const activeStars = sceneRef.current.shootingStars
            ? sceneRef.current.shootingStars.filter((star) => star.active)
                .length
            : 0;
          const headProgress = (anim.headFormationProgress * 100).toFixed(0);
          const highMidPercent = (highMidAvg * 100).toFixed(0);
          const combinedAudio = (highMidAvg * 0.6 + highAvg * 0.4) * 100;
          setDebugInfo(
            `Sub: ${(subBassAvg * 100).toFixed(0)}% | Low: ${(lowBassAvg * 100).toFixed(0)}% | HiMid: ${highMidPercent}%/${(SHOOTING_STAR_CONFIG.highMidThreshold * 100).toFixed(0)}% | High: ${(highAvg * 100).toFixed(0)}%/${(SHOOTING_STAR_CONFIG.highFreqThreshold * 100).toFixed(0)}% | Combined: ${combinedAudio.toFixed(0)}%/${(SHOOTING_STAR_CONFIG.combinedThreshold * 100).toFixed(0)}% | Head: ${headProgress}%/90% | Stars: ${activeStars}/${SHOOTING_STAR_CONFIG.maxActiveStars}`,
          );
        }
      } else {
        for (let i = 0; i < pathLength; i++) {
          radiusArray[i] = 0;
          shakeArray[i * 3] = 0;
          shakeArray[i * 3 + 1] = 0;
          shakeArray[i * 3 + 2] = 0;
          rotationArray[i] = 0;
          panArray[i] = 0;
        }
        controls.autoRotateSpeed = 0.1;

        // Decay chromatic aberration when not playing
        anim.chromaticStrength *= 0.95;

        // Fade out shooting stars when not playing
        anim.headFormationProgress = 0;
        anim.lastStarSpawnTime = 0;

        // Deactivate all shooting stars when not playing
        if (sceneRef.current.shootingStars) {
          sceneRef.current.shootingStars.forEach((star) => {
            if (star.active) {
              star.active = false;
              star.mesh.visible = false;
              star.material.opacity = 0;
            }
          });
        }
      }

      // Update chromatic aberration uniforms
      if (chromaticShader && postQuad) {
        // Use the combined strength (base + tracer)
        const totalChromaticStrength =
          anim.chromaticStrength + anim.chromaticTracer;
        chromaticShader.uniforms.uChromaticStrength.value =
          totalChromaticStrength;
        chromaticShader.uniforms.uChromaticDirection.value.copy(
          anim.chromaticDirection,
        );
        chromaticShader.uniforms.uTime.value = anim.time;
        chromaticShader.uniforms.uWavePhase.value = anim.chromaticWavePhase;
      }

      // Render with post-processing
      if (renderTarget && postScene && postCamera && postQuad) {
        // Render scene to texture
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, camera);

        // Apply chromatic aberration
        renderer.setRenderTarget(null);
        postQuad.material.uniforms.tDiffuse.value = renderTarget.texture;
        renderer.render(postScene, postCamera);
      } else {
        // Fallback to normal rendering
        renderer.render(scene, camera);
      }

      frameCount++;
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!sceneRef.current) return;
      const { camera, renderer, renderTarget, chromaticShader } =
        sceneRef.current;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);

      if (renderTarget) {
        renderTarget.setSize(window.innerWidth, window.innerHeight);
      }

      if (chromaticShader) {
        chromaticShader.uniforms.uScreenSize.value.set(
          window.innerWidth,
          window.innerHeight,
        );
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
      if (sceneRef.current) {
        sceneRef.current.controls.dispose();
        sceneRef.current.renderer.dispose();
        if (sceneRef.current.renderTarget) {
          sceneRef.current.renderTarget.dispose();
        }
        if (
          containerRef.current?.contains(sceneRef.current.renderer.domElement)
        ) {
          containerRef.current.removeChild(
            sceneRef.current.renderer.domElement,
          );
        }
      }
    };
  }, []);

  const handlePlay = async () => {
    if (!audioRef.current || !sceneRef.current) return;

    setDebugInfo("Initializing audio...");
    try {
      if (!sceneRef.current.analyzer) {
        sceneRef.current.analyzer = new AudioAnalyzer(pathLength * 4, 0.85);
      }
      const success = await sceneRef.current.analyzer.init(audioRef.current);
      if (!success) {
        setDebugInfo("Failed to initialize audio");
        return;
      }
      if (sceneRef.current.analyzer.context.state === "suspended") {
        await sceneRef.current.analyzer.context.resume();
      }
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setIsPlaying(true);
      isPlayingRef.current = true;
      setShowPlayButton(false);
      setDebugInfo("Playing...");
      sceneRef.current.camera.position.set(0, 0, 10000);
      sceneRef.current.controls.distance = 10000;
      sceneRef.current.controls.targetDistance = 1500;
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
              Play Head-Shaped Particles
            </button>
            <p className="text-sm text-white">
              77,777 particles will form a head shape and react to music
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Now with chromatic aberration effects!
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

export default AudioVisualizerWithObject;
