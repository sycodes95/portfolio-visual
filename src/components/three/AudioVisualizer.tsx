import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// Audio Analyzer (matching original SpectrumAnalyzer)
class AudioAnalyzer {
  context: AudioContext;
  analyzerNode: AnalyserNode;
  source: MediaElementAudioSourceNode | null = null;
  frequencyByteData: Uint8Array;
  timeByteData: Uint8Array;
  binCount: number;
  isConnected = false;

  constructor(binCount: number = 1024, smoothingTimeConstant: number = 0.85) {
    this.context = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    this.analyzerNode = this.context.createAnalyser();
    this.binCount = binCount;
    this.setBinCount(binCount);
    this.setSmoothingTimeConstant(smoothingTimeConstant);
  }

  setBinCount(binCount: number) {
    this.binCount = binCount;
    this.analyzerNode.fftSize = binCount * 2;
    this.frequencyByteData = new Uint8Array(binCount);
    this.timeByteData = new Uint8Array(binCount);
  }

  setSmoothingTimeConstant(smoothingTimeConstant: number) {
    this.analyzerNode.smoothingTimeConstant = smoothingTimeConstant;
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
    return this.frequencyByteData;
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
    this.analyzerNode.getByteTimeDomainData(this.timeByteData);
  }
}

const BASS_CONFIG = {
  bassIntensity: 0.7,
  midIntensity: 0.6,
  highIntensity: 0.6,
  radiusMultiplier: 12,
  radiusPower: 22,
  particleScaleMax: 2,
  roundnessMultiplier: 8,
  lightIntensityMultiplier: 6,
  rotationSpeedMax: 16,
  enableColorShift: true,
};

const AudioVisualizer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    particles: THREE.Mesh;
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

    // Define THREE.BAS from vanilla JS
    THREE.BAS = {};

    THREE.BAS.ShaderChunk = {};

    THREE.BAS.ShaderChunk["animation_time"] =
      "float tDelay = aAnimation.x;\nfloat tDuration = aAnimation.y;\nfloat tTime = clamp(uTime - tDelay, 0.0, tDuration);\nfloat tProgress = ease(tTime, 0.0, 1.0, tDuration);\n";

    THREE.BAS.ShaderChunk["catmull-rom"] =
      "vec3 catmullRom(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t)\n{\n    vec3 v0 = (p2 - p0) * 0.5;\n    vec3 v1 = (p3 - p1) * 0.5;\n    float t2 = t * t;\n    float t3 = t * t * t;\n\n    return vec3((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);\n}\n\nvec3 catmullRom(vec3 p0, vec3 p1, vec3 p2, vec3 p3, vec2 c, float t)\n{\n    vec3 v0 = (p2 - p0) * c.x;\n    vec3 v1 = (p3 - p1) * c.y;\n    float t2 = t * t;\n    float t3 = t * t * t;\n\n    return vec3((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);\n}\n\nfloat catmullRom(float p0, float p1, float p2, float p3, float t)\n{\n    float v0 = (p2 - p0) * 0.5;\n    float v1 = (p3 - p1) * 0.5;\n    float t2 = t * t;\n    float t3 = t * t * t;\n\n    return float((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);\n}\n\nfloat catmullRom(float p0, float p1, float p2, float p3, vec2 c, float t)\n{\n    float v0 = (p2 - p0) * c.x;\n    float v1 = (p3 - p1) * c.y;\n    float t2 = t * t;\n    float t3 = t * t * t;\n\n    return float((2.0 * p1 - 2.0 * p2 + v0 + v1) * t3 + (-3.0 * p1 + 3.0 * p2 - 2.0 * v0 - v1) * t2 + v0 * t + p1);\n}\n";

    THREE.BAS.ShaderChunk["cubic_bezier"] =
      "vec3 cubicBezier(vec3 p0, vec3 c0, vec3 c1, vec3 p1, float t)\n{\n    vec3 tp;\n    float tn = 1.0 - t;\n\n    tp.xyz = tn * tn * tn * p0.xyz + 3.0 * tn * tn * t * c0.xyz + 3.0 * tn * t * t * c1.xyz + t * t * t * p1.xyz;\n\n    return tp;\n}\n";

    THREE.BAS.ShaderChunk["ease_in_cubic"] =
      "float ease(float t, float b, float c, float d) {\n  return c*(t/=d)*t*t + b;\n}\n";

    THREE.BAS.ShaderChunk["ease_in_out_cubic"] =
      "float ease(float t, float b, float c, float d) {\n  if ((t/=d/2.0) < 1.0) return c/2.0*t*t*t + b;\n  return c/2.0*((t-=2.0)*t*t + 2.0) + b;\n}\n";

    THREE.BAS.ShaderChunk["ease_in_quad"] =
      "float ease(float t, float b, float c, float d) {\n  return c*(t/=d)*t + b;\n}\n";

    THREE.BAS.ShaderChunk["ease_out_cubic"] =
      "float ease(float t, float b, float c, float d) {\n  return c*((t=t/d - 1.0)*t*t + 1.0) + b;\n}\n";

    THREE.BAS.ShaderChunk["quaternion_rotation"] =
      "vec3 rotateVector(vec4 q, vec3 v)\n{\n    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);\n}\n\nvec4 quatFromAxisAngle(vec3 axis, float angle)\n{\n    float halfAngle = angle * 0.5;\n    return vec4(axis.xyz * sin(halfAngle), cos(halfAngle));\n}\n";

    THREE.BAS.PrefabBufferGeometry = function (prefab, count) {
      THREE.BufferGeometry.call(this);
      this.prefabGeometry = prefab;
      this.prefabCount = count;
      this.prefabVertexCount = prefab.vertices.length;
      this.bufferDefaults();
    };
    THREE.BAS.PrefabBufferGeometry.prototype = Object.create(
      THREE.BufferGeometry.prototype,
    );
    THREE.BAS.PrefabBufferGeometry.prototype.constructor =
      THREE.BAS.PrefabBufferGeometry;

    THREE.BAS.PrefabBufferGeometry.prototype.bufferDefaults = function () {
      var prefabFaceCount = this.prefabGeometry.faces.length;
      var prefabIndexCount = this.prefabGeometry.faces.length * 3;
      var prefabVertexCount = (this.prefabVertexCount =
        this.prefabGeometry.vertices.length);
      var prefabIndices = [];
      for (var h = 0; h < prefabFaceCount; h++) {
        var face = this.prefabGeometry.faces[h];
        prefabIndices.push(face.a, face.b, face.c);
      }
      var indexBuffer = new Uint32Array(this.prefabCount * prefabIndexCount);
      var positionBuffer = new Float32Array(
        this.prefabCount * prefabVertexCount * 3,
      );
      this.setIndex(new THREE.BufferAttribute(indexBuffer, 1));
      this.addAttribute(
        "position",
        new THREE.BufferAttribute(positionBuffer, 3),
      );
      for (var i = 0, offset = 0; i < this.prefabCount; i++) {
        for (var j = 0; j < prefabVertexCount; j++, offset += 3) {
          var prefabVertex = this.prefabGeometry.vertices[j];
          positionBuffer[offset] = prefabVertex.x;
          positionBuffer[offset + 1] = prefabVertex.y;
          positionBuffer[offset + 2] = prefabVertex.z;
        }
        for (var k = 0; k < prefabIndexCount; k++) {
          indexBuffer[i * prefabIndexCount + k] =
            prefabIndices[k] + i * prefabVertexCount;
        }
      }
    };

    THREE.BAS.PrefabBufferGeometry.prototype.bufferUvs = function () {
      var prefabFaceCount = this.prefabGeometry.faces.length;
      var prefabVertexCount = (this.prefabVertexCount =
        this.prefabGeometry.vertices.length);
      var prefabUvs = [];
      for (var h = 0; h < prefabFaceCount; h++) {
        var face = this.prefabGeometry.faces[h];
        var uv = this.prefabGeometry.faceVertexUvs[0][h];
        prefabUvs[face.a] = uv[0];
        prefabUvs[face.b] = uv[1];
        prefabUvs[face.c] = uv[2];
      }
      var uvBuffer = this.createAttribute("uv", 2);
      for (var i = 0, offset = 0; i < this.prefabCount; i++) {
        for (var j = 0; j < prefabVertexCount; j++, offset += 2) {
          var prefabUv = prefabUvs[j];
          uvBuffer.array[offset] = prefabUv.x;
          uvBuffer.array[offset + 1] = prefabUv.y;
        }
      }
    };

    THREE.BAS.PrefabBufferGeometry.prototype.createAttribute = function (
      name,
      itemSize,
    ) {
      var buffer = new Float32Array(
        this.prefabCount * this.prefabVertexCount * itemSize,
      );
      var attribute = new THREE.BufferAttribute(buffer, itemSize);
      this.addAttribute(name, attribute);
      return attribute;
    };

    THREE.BAS.PrefabBufferGeometry.prototype.setAttribute4 = function (
      name,
      data,
    ) {
      var offset = 0;
      var array = this.attributes[name].array;
      var i, j;
      for (i = 0; i < data.length; i++) {
        var v = data[i];
        for (j = 0; j < this.prefabVertexCount; j++) {
          array[offset++] = v.x;
          array[offset++] = v.y;
          array[offset++] = v.z;
          array[offset++] = v.w;
        }
      }
      this.attributes[name].needsUpdate = true;
    };

    THREE.BAS.PrefabBufferGeometry.prototype.setAttribute3 = function (
      name,
      data,
    ) {
      var offset = 0;
      var array = this.attributes[name].array;
      var i, j;
      for (i = 0; i < data.length; i++) {
        var v = data[i];
        for (j = 0; j < this.prefabVertexCount; j++) {
          array[offset++] = v.x;
          array[offset++] = v.y;
          array[offset++] = v.z;
        }
      }
      this.attributes[name].needsUpdate = true;
    };

    THREE.BAS.PrefabBufferGeometry.prototype.setAttribute2 = function (
      name,
      data,
    ) {
      var offset = 0;
      var array = this.attributes[name].array;
      var i, j;
      for (i = 0; i < this.prefabCount; i++) {
        var v = data[i];
        for (j = 0; j < this.prefabVertexCount; j++) {
          array[offset++] = v.x;
          array[offset++] = v.y;
        }
      }
      this.attributes[name].needsUpdate = true;
    };

    THREE.BAS.BaseAnimationMaterial = function (parameters) {
      THREE.ShaderMaterial.call(this);
      this.shaderFunctions = [];
      this.shaderParameters = [];
      this.shaderVertexInit = [];
      this.shaderTransformNormal = [];
      this.shaderTransformPosition = [];
      this.setValues(parameters);
    };
    THREE.BAS.BaseAnimationMaterial.prototype = Object.create(
      THREE.ShaderMaterial.prototype,
    );
    THREE.BAS.BaseAnimationMaterial.prototype.constructor =
      THREE.BAS.BaseAnimationMaterial;

    THREE.BAS.BaseAnimationMaterial.prototype._concatVertexShader =
      function () {
        return "";
      };

    THREE.BAS.BaseAnimationMaterial.prototype._concatFunctions = function () {
      return this.shaderFunctions.join("\n");
    };

    THREE.BAS.BaseAnimationMaterial.prototype._concatParameters = function () {
      return this.shaderParameters.join("\n");
    };

    THREE.BAS.BaseAnimationMaterial.prototype._concatVertexInit = function () {
      return this.shaderVertexInit.join("\n");
    };

    THREE.BAS.BaseAnimationMaterial.prototype._concatTransformNormal =
      function () {
        return this.shaderTransformNormal.join("\n");
      };

    THREE.BAS.BaseAnimationMaterial.prototype._concatTransformPosition =
      function () {
        return this.shaderTransformPosition.join("\n");
      };

    THREE.BAS.BaseAnimationMaterial.prototype.setUniformValues = function (
      values,
    ) {
      for (var key in values) {
        if (key in this.uniforms) {
          var uniform = this.uniforms[key];
          var value = values[key];
          switch (uniform.type) {
            case "c":
              uniform.value.set(value);
              break;
            case "v2":
            case "v3":
            case "v4":
              uniform.value.copy(value);
              break;
            case "f":
            case "t":
            default:
              uniform.value = value;
          }
        }
      }
    };

    THREE.BAS.PhongAnimationMaterial = function (parameters, uniformValues) {
      THREE.BAS.BaseAnimationMaterial.call(this, parameters);
      var phongShader = THREE.ShaderLib["phong"];
      this.uniforms = THREE.UniformsUtils.merge([
        phongShader.uniforms,
        this.uniforms,
      ]);
      this.lights = true;
      this.vertexShader = this._concatVertexShader();
      this.fragmentShader = phongShader.fragmentShader;
      uniformValues.map && (this.defines["USE_MAP"] = "");
      uniformValues.normalMap && (this.defines["USE_NORMALMAP"] = "");
      this.setUniformValues(uniformValues);
    };
    THREE.BAS.PhongAnimationMaterial.prototype = Object.create(
      THREE.BAS.BaseAnimationMaterial.prototype,
    );
    THREE.BAS.PhongAnimationMaterial.prototype.constructor =
      THREE.BAS.PhongAnimationMaterial;

    THREE.BAS.PhongAnimationMaterial.prototype._concatVertexShader =
      function () {
        return [
          "#define PHONG",
          "varying vec3 vViewPosition;",
          "#ifndef FLAT_SHADED",
          "	varying vec3 vNormal;",
          "#endif",
          THREE.ShaderChunk["common"],
          THREE.ShaderChunk["uv_pars_vertex"],
          THREE.ShaderChunk["uv2_pars_vertex"],
          THREE.ShaderChunk["displacementmap_pars_vertex"],
          THREE.ShaderChunk["envmap_pars_vertex"],
          THREE.ShaderChunk["lights_phong_pars_vertex"],
          THREE.ShaderChunk["color_pars_vertex"],
          THREE.ShaderChunk["morphtarget_pars_vertex"],
          THREE.ShaderChunk["skinning_pars_vertex"],
          THREE.ShaderChunk["shadowmap_pars_vertex"],
          THREE.ShaderChunk["logdepthbuf_pars_vertex"],
          this._concatFunctions(),
          this._concatParameters(),
          "void main() {",
          this._concatVertexInit(),
          THREE.ShaderChunk["uv_vertex"],
          THREE.ShaderChunk["uv2_vertex"],
          THREE.ShaderChunk["color_vertex"],
          THREE.ShaderChunk["beginnormal_vertex"],
          this._concatTransformNormal(),
          THREE.ShaderChunk["morphnormal_vertex"],
          THREE.ShaderChunk["skinbase_vertex"],
          THREE.ShaderChunk["skinnormal_vertex"],
          THREE.ShaderChunk["defaultnormal_vertex"],
          "#ifndef FLAT_SHADED",
          "	vNormal = normalize(transformedNormal);",
          "#endif",
          THREE.ShaderChunk["begin_vertex"],
          this._concatTransformPosition(),
          THREE.ShaderChunk["displacementmap_vertex"],
          THREE.ShaderChunk["morphtarget_vertex"],
          THREE.ShaderChunk["skinning_vertex"],
          THREE.ShaderChunk["project_vertex"],
          THREE.ShaderChunk["logdepthbuf_vertex"],
          "	vViewPosition = - mvPosition.xyz;",
          THREE.ShaderChunk["worldpos_vertex"],
          THREE.ShaderChunk["envmap_vertex"],
          THREE.ShaderChunk["lights_phong_vertex"],
          THREE.ShaderChunk["shadowmap_vertex"],
          "}",
        ].join("\n");
      };

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
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.minDistance = 50;
    controls.maxDistance = 1200;
    controls.minPolarAngle = Math.PI * 0.4;
    controls.maxPolarAngle = Math.PI * 0.6;

    // Create path
    const pathArray: number[] = [];
    const radiusArray: number[] = [];
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
        x = THREE.Math.randFloatSpread(400);
        y = -400 + (800 / pathLength) * i + THREE.Math.randFloatSpread(200);
        z = THREE.Math.randFloatSpread(400);
      }

      pathArray.push(x, y, z);
      radiusArray.push(0);
    }

    // Create prefab geometry (sphere)
    const prefabGeometry = new THREE.SphereGeometry(2, 4, 4);
    const bufferGeometry = new THREE.BAS.PrefabBufferGeometry(
      prefabGeometry,
      particleCount,
    );

    const aDelayDuration = bufferGeometry.createAttribute("aDelayDuration", 2);
    const aPivot = bufferGeometry.createAttribute("aPivot", 3);
    const aAxisAngle = bufferGeometry.createAttribute("aAxisAngle", 4);
    const aColor = bufferGeometry.createAttribute("color", 3);

    let i, j, offset;
    const prefabDelay = 0.00005;
    const vertexDelay = 0.005;
    for (i = 0, offset = 0; i < particleCount; i++) {
      const delay = i * prefabDelay;
      const duration = THREE.Math.randFloat(minDuration, maxDuration);
      for (j = 0; j < prefabGeometry.vertices.length; j++) {
        aDelayDuration.array[offset++] = delay + j * vertexDelay;
        aDelayDuration.array[offset++] = duration;
      }
    }

    const pivot = new THREE.Vector3();
    for (i = 0, offset = 0; i < particleCount; i++) {
      pivot.x = THREE.Math.randFloat(0, 2);
      pivot.y = THREE.Math.randFloat(0, 2);
      pivot.z = THREE.Math.randFloat(0, 2);
      for (j = 0; j < prefabGeometry.vertices.length; j++) {
        aPivot.array[offset++] = pivot.x;
        aPivot.array[offset++] = pivot.y;
        aPivot.array[offset++] = pivot.z;
      }
    }

    const axis = new THREE.Vector3();
    let angle = 0;
    for (i = 0, offset = 0; i < particleCount; i++) {
      axis.x = THREE.Math.randFloatSpread(2);
      axis.y = THREE.Math.randFloatSpread(2);
      axis.z = THREE.Math.randFloatSpread(2);
      axis.normalize();
      angle = Math.PI * THREE.Math.randInt(12, 24);
      for (j = 0; j < prefabGeometry.vertices.length; j++) {
        aAxisAngle.array[offset++] = axis.x;
        aAxisAngle.array[offset++] = axis.y;
        aAxisAngle.array[offset++] = axis.z;
        aAxisAngle.array[offset++] = angle;
      }
    }

    const color = new THREE.Color(0xff0000);
    for (i = 0, offset = 0; i < particleCount; i++) {
      for (j = 0; j < prefabGeometry.vertices.length; j++) {
        aColor.array[offset++] = color.r;
        aColor.array[offset++] = color.g;
        aColor.array[offset++] = color.b;
      }
    }

    // Add normals attribute
    const prefabNormals = prefabGeometry.attributes.normal.array;
    const totalVertices = particleCount * prefabGeometry.vertices.length;
    const normalBuffer = new Float32Array(totalVertices * 3);
    for (i = 0, offset = 0; i < particleCount; i++) {
      for (j = 0; j < prefabGeometry.vertices.length; j++, offset += 3) {
        normalBuffer[offset] = prefabNormals[j * 3];
        normalBuffer[offset + 1] = prefabNormals[j * 3 + 1];
        normalBuffer[offset + 2] = prefabNormals[j * 3 + 2];
      }
    }
    bufferGeometry.addAttribute(
      "normal",
      new THREE.BufferAttribute(normalBuffer, 3),
    );

    // Material
    const material = new THREE.BAS.PhongAnimationMaterial(
      {
        vertexColors: THREE.VertexColors,
        flatShading: true,
        side: THREE.DoubleSide,
        defines: { PATH_LENGTH: pathLength },
        uniforms: {
          uTime: { value: 0 },
          uPath: { value: pathArray },
          uRadius: { value: radiusArray },
          uRoundness: { value: new THREE.Vector2(2, 2) },
          uParticleScale: { value: 1.0 },
        },
        shaderFunctions: [
          THREE.BAS.ShaderChunk["quaternion_rotation"],
          THREE.BAS.ShaderChunk["catmull-rom"],
          THREE.BAS.ShaderChunk["ease_in_out_cubic"],
        ],
        shaderParameters: [
          "uniform float uTime;",
          "uniform vec3 uPath[PATH_LENGTH];",
          "uniform float uRadius[PATH_LENGTH];",
          "uniform vec2 uRoundness;",
          "uniform float uParticleScale;",
          "attribute vec2 aDelayDuration;",
          "attribute vec3 aPivot;",
          "attribute vec4 aAxisAngle;",
        ],
        shaderVertexInit: [
          "float tDelay = aDelayDuration.x;",
          "float tDuration = aDelayDuration.y;",
          "float tTime = clamp(uTime - tDelay, 0.0, tDuration);",
          "float tProgress = tTime / tDuration;",
          "float angle = aAxisAngle.w * tProgress;",
          "vec4 tQuat = quatFromAxisAngle(aAxisAngle.xyz, angle);",
        ],
        shaderTransformNormal: [
          "objectNormal = rotateVector(tQuat, objectNormal);",
        ],
        shaderTransformPosition: [
          "float tMax = float(PATH_LENGTH - 1);",
          "float tPoint = tMax * tProgress;",
          "float tIndex = floor(tPoint);",
          "float tWeight = tPoint - tIndex;",
          "int i0 = int(max(0.0, tIndex - 1.0));",
          "int i1 = int(tIndex);",
          "int i2 = int(min(tIndex + 1.0, tMax));",
          "int i3 = int(min(tIndex + 2.0, tMax));",
          "vec3 p0 = uPath[i0];",
          "vec3 p1 = uPath[i1];",
          "vec3 p2 = uPath[i2];",
          "vec3 p3 = uPath[i3];",
          "float radius = catmullRom(uRadius[i0], uRadius[i1], uRadius[i2], uRadius[i3], tWeight);",
          "transformed += aPivot * radius;",
          "transformed = rotateVector(tQuat, transformed);",
          "transformed *= uParticleScale;",
          "transformed += catmullRom(p0, p1, p2, p3, uRoundness, tWeight);",
        ],
      },
      {
        shininess: 10,
        specular: 0x000000,
        emissive: 0xff0000,
      },
    );

    const particles = new THREE.Mesh(bufferGeometry, material);
    particles.frustumCulled = false;
    scene.add(particles);

    // Store references
    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      particles,
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

      const { camera, renderer, scene, controls, particles } = sceneRef.current;
      const anim = animState.current;

      controls.update();

      // Update time
      anim.time = audioRef.current?.currentTime || 0;
      particles.material.uniforms.uTime.value = anim.time;

      // Audio processing
      if (
        sceneRef.current.analyzer &&
        isPlaying &&
        audioRef.current &&
        !audioRef.current.paused
      ) {
        sceneRef.current.analyzer.updateSample();
        const data = sceneRef.current.analyzer.frequencyByteData;
        const dataArray: number[] = [];
        const cap = data.length * 0.5;

        anim.noiseOffset += 0.01;

        // Calculate frequency bands
        const bassEndBin = Math.floor(
          250 / (44100 / (sceneRef.current.analyzer.binCount * 2)),
        );
        const midEndBin = Math.floor(
          500 / (44100 / (sceneRef.current.analyzer.binCount * 2)),
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
        let bassAvg =
          (bassTotal / Math.max(1, bassCount) / 255) *
          BASS_CONFIG.bassIntensity;
        bassAvg +=
          Math.sin(anim.noiseOffset * 2.3 + anim.randomSeed) * 0.05 * bassAvg;

        // Bass hit detection
        const bassHit = bassAvg > 0.6 && anim.previousBassAvg < 0.5;
        if (bassHit) {
          anim.bassHitTime = Date.now();
        }
        anim.previousBassAvg = bassAvg;

        for (let i = bassEndBin; i < midEndBin; i++) {
          midTotal += data[i];
        }
        let midAvg =
          (midTotal / Math.max(1, midCount) / 255) * BASS_CONFIG.midIntensity;
        midAvg +=
          Math.sin(anim.noiseOffset * 1.7 + anim.randomSeed * 2) *
          0.05 *
          midAvg;

        for (let i = midEndBin; i < cap; i++) {
          highTotal += data[i];
        }
        let highAvg =
          (highTotal / Math.max(1, highCount) / 255) *
          BASS_CONFIG.highIntensity;
        highAvg +=
          Math.sin(anim.noiseOffset * 3.1 + anim.randomSeed * 3) *
          0.05 *
          highAvg;

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
        const r =
          BASS_CONFIG.roundnessMultiplier * Math.pow(bassAvg, 2) +
          1 +
          Math.sin(anim.noiseOffset * 3) * 0.5;
        particles.material.uniforms.uRoundness.value.set(r, r);

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

        // Color shift
        if (BASS_CONFIG.enableColorShift && bassAvg > 0.5) {
          const hueShift = Math.sin(anim.noiseOffset * 2) * 0.05;
          lights.light1.color.setHSL(0.0 + hueShift, 1.0, 0.5 + bassAvg * 0.5);
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
        } else {
          lights.light1.color.setHex(0xff0000);
          lights.light2.color.setHex(0xff0000);
          lights.light3.color.setHex(0x000000); // Matching vanilla, even if potentially a typo
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
        sceneRef.current.camera.position.set(0, 0, 10000);
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
        src="https://audio.jukehost.co.uk/TDrkUvipGApgKgYZ7ovXBv42i4EHUAMD"
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
