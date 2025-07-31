import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// Camera Controller
class CameraController {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  autoRotate = true;
  autoRotateSpeed = 2.0;
  rotationY = 0;
  targetPosition = new THREE.Vector3(0, 0, 1200);
  currentPosition = new THREE.Vector3(0, 0, 1200);
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

    this.spherical.setFromVector3(this.currentPosition);

    this.domElement.addEventListener("wheel", this.onWheel.bind(this));
    this.domElement.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.domElement.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.domElement.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.domElement.addEventListener("mouseleave", this.onMouseUp.bind(this));
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    this.spherical.radius += e.deltaY * 0.5;
    this.spherical.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.spherical.radius),
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

    this.spherical.theta -= deltaX * 0.01;
    this.spherical.phi += deltaY * 0.01;
    this.spherical.phi = Math.max(
      this.minPolarAngle,
      Math.min(this.maxPolarAngle, this.spherical.phi),
    );

    this.previousMouseX = e.clientX;
    this.previousMouseY = e.clientY;
  }

  onMouseUp() {
    this.isDragging = false;
  }

  update() {
    if (this.autoRotate && !this.isDragging) {
      this.spherical.theta += this.autoRotateSpeed * 0.005;
    }

    this.currentPosition.setFromSpherical(this.spherical);
    this.camera.position.copy(this.currentPosition);
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
  context: AudioContext;
  analyzerNode: AnalyserNode;
  source: MediaElementAudioSourceNode | null = null;
  dataArray: Uint8Array;
  isConnected = false;
  binCount: number;

  constructor(binCount: number = 1024, smoothingTimeConstant: number = 0.85) {
    this.context = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    this.analyzerNode = this.context.createAnalyser();
    this.binCount = binCount;
    this.analyzerNode.fftSize = binCount * 2;
    this.analyzerNode.smoothingTimeConstant = smoothingTimeConstant;
    this.dataArray = new Uint8Array(this.analyzerNode.frequencyBinCount);
  }

  async init(audioElement: HTMLAudioElement) {
    try {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      if (!this.source && !this.isConnected) {
        this.source = this.context.createMediaElementSource(audioElement);
        const pannerNode = this.context.createStereoPanner();
        this.source.connect(pannerNode);
        pannerNode.connect(this.analyzerNode);
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
    if (this.analyzerNode && this.isConnected) {
      this.analyzerNode.getByteFrequencyData(this.dataArray);
    }
    return this.dataArray;
  }

  updateSample() {
    this.getFrequencyData();
  }
}

const BASS_CONFIG = {
  bassIntensity: 0.7,
  midIntensity: 0.6,
  highIntensity: 0.6,
  radiusMultiplier: 16,
  radiusPower: 10,
  particleScaleMax: 2,
  roundnessMultiplier: 8,
  lightIntensityMultiplier: 6,
  rotationSpeedMax: 16,
  enableColorShift: true,
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

function catmullRomVec3(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  roundness: THREE.Vector2,
): THREE.Vector3 {
  const v0 = new THREE.Vector3().subVectors(p2, p0).multiplyScalar(roundness.x);
  const v1 = new THREE.Vector3().subVectors(p3, p1).multiplyScalar(roundness.y);
  const t2 = t * t;
  const t3 = t * t * t;

  const result = new THREE.Vector3();
  result.x =
    (2.0 * p1.x - 2.0 * p2.x + v0.x + v1.x) * t3 +
    (-3.0 * p1.x + 3.0 * p2.x - 2.0 * v0.x - v1.x) * t2 +
    v0.x * t +
    p1.x;
  result.y =
    (2.0 * p1.y - 2.0 * p2.y + v0.y + v1.y) * t3 +
    (-3.0 * p1.y + 3.0 * p2.y - 2.0 * v0.y - v1.y) * t2 +
    v0.y * t +
    p1.y;
  result.z =
    (2.0 * p1.z - 2.0 * p2.z + v0.z + v1.z) * t3 +
    (-3.0 * p1.z + 3.0 * p2.z - 2.0 * v0.z - v1.z) * t2 +
    v0.z * t +
    p1.z;

  return result;
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

  const pathLength = 256;
  const particleCount = 77777;
  const prefabDelay = 0.00005;
  const vertexDelay = 0.005;
  const minDuration = 40;
  const maxDuration = 600;

  const animState = useRef({
    time: 0,
    noiseOffset: 0,
    randomSeed: Math.random() * 1000,
    previousBassAvg: 0,
    bassHitTime: 0,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    console.log("Initializing 77,777 particle system...");

    // Scene setup
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      5000,
    );
    camera.position.set(0, 0, 1200);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    containerRef.current.appendChild(renderer.domElement);

    // Lights
    const light1 = new THREE.PointLight(0xff0000, 0.25, 1200, 2);
    light1.position.set(0, 0, 0);
    scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xff0000, 0.25);
    light2.position.set(0, 1, 1);
    scene.add(light2);

    const light3 = new THREE.DirectionalLight(0xff0000, 0.25);
    light3.position.set(0, 1, -1);
    scene.add(light3);

    // Camera controller
    const controls = new CameraController(camera, renderer.domElement);

    // Create path
    const pathPositions = new Float32Array(pathLength * 3);
    const radiusArray = new Float32Array(pathLength);

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

      // Random pivot
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
        colors[vertexIndex * 3] = 1.0;
        colors[vertexIndex * 3 + 1] = 0.0;
        colors[vertexIndex * 3 + 2] = 0.0;

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

    // Vertex shader with BAS-like functionality
    const vertexShader = `
      #define PATH_LENGTH ${pathLength}
      
      uniform float uTime;
      uniform vec3 uPath[PATH_LENGTH];
      uniform float uRadius[PATH_LENGTH];
      uniform vec2 uRoundness;
      uniform float uParticleScale;
      
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
      
      float ease(float t, float b, float c, float d) {
        if ((t/=d/2.0) < 1.0) return c/2.0*t*t*t + b;
        return c/2.0*((t-=2.0)*t*t + 2.0) + b;
      }
      
      void main() {
        vColor = color;
        
        float tDelay = aDelayDuration.x;
        float tDuration = aDelayDuration.y;
        float tTime = clamp(uTime - tDelay, 0.0, tDuration);
        float tProgress = ease(tTime, 0.0, 1.0, tDuration);
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
        
        float radius = catmullRom(uRadius[i0], uRadius[i1], uRadius[i2], uRadius[i3], tWeight);
        
        transformed += aPivot * radius;
        transformed = rotateVector(tQuat, transformed);
        transformed *= uParticleScale;
        transformed += catmullRom(p0, p1, p2, p3, uRoundness, tWeight);
        
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        vNormal = normalize(normalMatrix * objectNormal);
        vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      }
    `;

    // Fragment shader (simple emissive + lighting)
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
        uRoundness: { value: new THREE.Vector2(2, 2) },
        uParticleScale: { value: 1.0 },
        uEmissive: { value: new THREE.Color(1.0, 0.0, 0.0) },
        uLightPos1: { value: new THREE.Vector3(0, 0, 0) },
        uLightPos2: { value: new THREE.Vector3(0, 1, 1) },
        uLightPos3: { value: new THREE.Vector3(0, 1, -1) },
        uLightColor1: { value: new THREE.Color(1, 0, 0) },
        uLightColor2: { value: new THREE.Color(1, 0, 0) },
        uLightColor3: { value: new THREE.Color(1, 0, 0) },
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
      lights: { light1, light2, light3 },
    };

    setDebugInfo("Ready to play");
    console.log("Particle system ready");

    // Animation loop
    let frameCount = 0;
    const animate = () => {
      frameId.current = requestAnimationFrame(animate);
      frameCount++;

      if (!sceneRef.current) return;

      const { camera, renderer, scene, controls, particles, radiusArray } =
        sceneRef.current;
      const anim = animState.current;

      controls.update();

      // Update time
      anim.time = audioRef.current?.currentTime || 0;
      if (particles.material && particles.material.uniforms) {
        particles.material.uniforms.uTime.value = anim.time;
      }

      // Audio processing
      if (
        sceneRef.current.analyzer &&
        isPlaying &&
        audioRef.current &&
        !audioRef.current.paused
      ) {
        sceneRef.current.analyzer.updateSample();
        const audioData = sceneRef.current.analyzer.dataArray;
        const data = audioData;
        const dataArray: number[] = [];
        const cap = data.length * 0.5;

        anim.noiseOffset += 0.01;

        // Calculate frequency bands
        const bassEndBin = Math.floor(
          250 / (44100 / sceneRef.current.analyzer.analyzerNode.fftSize),
        );
        const midEndBin = Math.floor(
          500 / (44100 / sceneRef.current.analyzer.analyzerNode.fftSize),
        );

        let bassTotal = 0,
          midTotal = 0,
          highTotal = 0;
        const bassCount = bassEndBin;
        const midCount = midEndBin - bassEndBin;
        const highCount = cap - midEndBin;

        for (let i = 0; i < bassEndBin; i++) {
          bassTotal += data[i];
        }
        const bassAvg =
          (bassTotal / Math.max(1, bassCount) / 255) *
            BASS_CONFIG.bassIntensity +
          Math.sin(anim.noiseOffset * 2.3 + anim.randomSeed) *
            0.05 *
            BASS_CONFIG.bassIntensity;

        // Bass hit detection
        const bassHit = bassAvg > 0.6 && anim.previousBassAvg < 0.5;
        if (bassHit) {
          anim.bassHitTime = Date.now();
        }
        anim.previousBassAvg = bassAvg;

        for (let i = bassEndBin; i < midEndBin; i++) {
          midTotal += data[i];
        }
        const midAvg =
          (midTotal / Math.max(1, midCount) / 255) * BASS_CONFIG.midIntensity +
          Math.sin(anim.noiseOffset * 1.7 + anim.randomSeed * 2) *
            0.05 *
            BASS_CONFIG.midIntensity;

        for (let i = midEndBin; i < cap; i++) {
          highTotal += data[i];
        }
        const highAvg =
          (highTotal / Math.max(1, highCount) / 255) *
            BASS_CONFIG.highIntensity +
          Math.sin(anim.noiseOffset * 3.1 + anim.randomSeed * 3) *
            0.05 *
            BASS_CONFIG.highIntensity;

        // Complex radius calculation
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
          maxVisibleProgress = 0.3;
        }

        const visibleRange = maxVisibleProgress - minVisibleProgress;
        const bassThreshold = minVisibleProgress + visibleRange / 3;
        const midThreshold = minVisibleProgress + (2 * visibleRange) / 3;

        // Process frequency data for all segments
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

            if (progressAlongPath <= bassThreshold || timeInPath <= 0) {
              weight = 1.8 + bassAvg * 4.0;
              weight += (Math.random() - 0.5) * 0.3;
              if (idx < bassEndBin) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = bassAvg * 255 * weight * 0.6;
              }
              if (bassHit && Math.random() > 0.7) {
                freqValue *= 1.3 + Math.random() * 0.4;
              }
            } else if (progressAlongPath < midThreshold) {
              weight = 1.2 + midAvg * 2.0;
              weight += (Math.random() - 0.5) * 0.2;
              if (idx >= bassEndBin && idx < midEndBin) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = midAvg * 255 * weight * 0.7;
              }
            } else {
              weight = 1.0 + highAvg * 1.5;
              weight += (Math.random() - 0.5) * 0.15;
              if (idx >= midEndBin) {
                freqValue = data[idx] * weight;
              } else {
                freqValue = highAvg * 255 * weight * 0.8;
              }
            }

            if (pass >= 2) {
              freqValue *= 0.7;
            }

            dataArray.push(freqValue);
          }
        }

        // Update radius array
        for (let i = 0; i < dataArray.length && i < pathLength; i++) {
          if (i && dataArray.length - i > 1) {
            let val = dataArray[i] / 255;
            val += Math.sin(anim.noiseOffset * 4 + i * 0.2) * 0.02;
            val = Math.max(0, Math.min(1, val));

            let baseRadius =
              Math.pow(val, BASS_CONFIG.radiusPower) *
              BASS_CONFIG.radiusMultiplier;
            baseRadius += (Math.random() - 0.5) * 2;

            const segmentIndex = i % (cap * 2);
            const segmentDelay = segmentIndex * prefabDelay;
            const timeInPath = currentTime - segmentDelay;
            const progressAlongPath = Math.min(
              1.0,
              Math.max(0.0, timeInPath / avgDuration),
            );

            if (progressAlongPath <= bassThreshold || timeInPath < 0) {
              baseRadius += bassAvg * bassAvg * 120;
              if (bassHit && Math.random() > 0.6) {
                baseRadius *= 1.2 + Math.random() * 0.3;
              }
            }

            radiusArray[i] = Math.max(1, baseRadius);
          } else {
            radiusArray[i] = 128;
          }
        }

        // Update material uniforms
        if (particles.material && particles.material.uniforms) {
          // Roundness
          const r = BASS_CONFIG.roundnessMultiplier * Math.pow(bassAvg, 2) + 1;
          particles.material.uniforms.uRoundness.value.set(
            r + Math.sin(anim.noiseOffset * 3) * 0.5,
            r + Math.sin(anim.noiseOffset * 3) * 0.5,
          );

          // Particle scale
          const bassParticleScale =
            1.0 + bassAvg * (BASS_CONFIG.particleScaleMax - 1.0) * 1.5;
          const overallEnergy = bassAvg * 0.5 + midAvg * 0.3 + highAvg * 0.2;
          let particleScale =
            1.0 + overallEnergy * (BASS_CONFIG.particleScaleMax - 1.0);
          particleScale = Math.max(particleScale, bassParticleScale);
          particleScale +=
            Math.sin(anim.noiseOffset * 5 + anim.randomSeed) * 0.05;

          particles.material.uniforms.uParticleScale.value = particleScale;
          particles.material.uniforms.uRadius.needsUpdate = true;
        }

        // Update lights
        const { lights } = sceneRef.current;
        const lightIntensity = bassAvg * BASS_CONFIG.lightIntensityMultiplier;
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

          // Color shift
          if (BASS_CONFIG.enableColorShift && bassAvg > 0.5) {
            const hueShift = Math.sin(anim.noiseOffset * 2) * 0.05;
            lights.light1.color.setHSL(
              0.0 + hueShift,
              1.0,
              0.5 + bassAvg * 0.5,
            );
            lights.light2.color.setHSL(
              0.1 + hueShift * 0.5,
              0.8,
              0.5 + bassAvg * 0.3,
            );
            lights.light3.color.setHSL(
              0.05 + hueShift * 0.7,
              0.9,
              0.5 + bassAvg * 0.4,
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
            lights.light1.color.setRGB(1, 0, 0);
            lights.light2.color.setRGB(1, 0, 0);
            lights.light3.color.setRGB(1, 0, 0);

            particles.material.uniforms.uLightColor1.value.set(1, 0, 0);
            particles.material.uniforms.uLightColor2.value.set(1, 0, 0);
            particles.material.uniforms.uLightColor3.value.set(1, 0, 0);
          }
        }

        // Update rotation speed
        let rotSpeed = 2.0 + bassAvg * BASS_CONFIG.rotationSpeedMax;
        rotSpeed += Math.sin(anim.noiseOffset * 0.7) * 0.5;
        if (Date.now() - anim.bassHitTime < 500) {
          rotSpeed += (Math.random() - 0.5) * 3;
        }
        controls.autoRotateSpeed = rotSpeed;

        if (frameCount % 30 === 0) {
          setDebugInfo(
            `Bass: ${(bassAvg * 100).toFixed(0)}% | Mid: ${(midAvg * 100).toFixed(0)}% | High: ${(highAvg * 100).toFixed(0)}%`,
          );
        }
      } else {
        // Default animation when not playing
        for (let i = 0; i < pathLength; i++) {
          radiusArray[i] = 128;
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

      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setIsPlaying(true);
      setShowPlayButton(false);
      setDebugInfo("Playing...");

      if (sceneRef.current) {
        sceneRef.current.controls.spherical.radius = 1000;
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
        src="https://audio.jukehost.co.uk/4muD75tIMG9HEUpUMttlRlJXCzAmWMwf"
        onEnded={() => {
          setIsPlaying(false);
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
              Play 77,777 Particles
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
