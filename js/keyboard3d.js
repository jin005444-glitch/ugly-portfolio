/* ============================================================
   UGLY — THREE.JS KEYBOARD
   Loads the NZXT miniTKL model, splits its merged keycap mesh
   into individual keys, animates every cap, lets the keys drift
   apart after three seconds of rest, and projects typed text
   into a floating hologram above the board.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

(() => {
  'use strict';

  const stage = document.querySelector('[data-kb-stage]');
  const canvas = document.querySelector('[data-kb-canvas]');
  const keyboard = document.querySelector('[data-keyboard]');
  if (!stage || !canvas || !keyboard) return;
  if (keyboard.dataset.kbReady === '1') return;
  keyboard.dataset.kbReady = '1';

  const output = keyboard.querySelector('[data-kb-output]');
  const statusEl = keyboard.querySelector('[data-kb-status]');
  const soundBtn = keyboard.querySelector('[data-kb-sound]');
  const soundLabel = keyboard.querySelector('[data-kb-sound-label]');
  const loaderEl = keyboard.querySelector('[data-kb-loader]');
  const loaderFill = keyboard.querySelector('[data-kb-progress]');
  const loaderPct = keyboard.querySelector('[data-kb-pct]');
  const loaderMeta = keyboard.querySelector('.kb-loader-meta');
  const tooltip = keyboard.querySelector('[data-kb-tooltip]');
  const flashEl = keyboard.querySelector('[data-kb-flash]');

  /* ----------------------------------------------------------
     LAYOUT
     The GLB ships every cap as one merged skinned mesh. Keys are
     recovered by position at load time; this table only names
     the recovered rows, left to right.
     ---------------------------------------------------------- */
  const ROW_LABELS = [
    ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'PrtSc', 'ScrLk', 'Pause'],
    ['^', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ß', '´', 'Backspace', 'Ins', 'Home'],
    ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü', '+', 'Del', 'End'],
    ['Enter'],
    ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä', '#', 'NZXT', 'PgUp'],
    ['Shift', '<>|', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '-', 'Shift', 'Up', 'PgDn'],
    ['Ctrl', 'Win', 'Alt', 'Space', 'AltGr', 'Fn', 'Ctrl', 'Left', 'Down', 'Right']
  ];
  const ROW_COUNTS = ROW_LABELS.map(row => row.length);

  const MAX_TEXT = 44;
  const IDLE_MS = 3000;
  const BOARD_WIDTH = 10;
  const ROW_GAP = 0.5;
  const MODEL_URL = new URL('../models/nzxt-minitkl.glb', import.meta.url).href;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Physical event.key -> cap legend. */
  const SPECIAL_KEYS = {
    ' ': 'Space', Spacebar: 'Space', Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab',
    Escape: 'Esc', Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', AltGraph: 'AltGr',
    Meta: 'Win', OS: 'Win', CapsLock: 'Caps', ArrowUp: 'Up', ArrowDown: 'Down',
    ArrowLeft: 'Left', ArrowRight: 'Right', Delete: 'Del', Insert: 'Ins',
    Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
    PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause', ContextMenu: 'Menu'
  };

  /* Shifted symbols map back to the cap to animate. */
  const SHIFT_TO_BASE = {
    '!': '1', '"': '2', '§': '3', '$': '4', '%': '5', '&': '6', '/': '7',
    '(': '8', ')': '9', '=': '0', '?': 'ß', '`': '´', '*': '+', "'": '#',
    ';': ',', ':': '.', '_': '-', '<': '<>|', '>': '<>|', '|': '<>|',
    '~': '+', '[': 'Ü', ']': '+', '\\': '#'
  };

  const state = {
    ready: false,
    loading: false,
    exploded: false,
    idleEnabled: true,
    sound: false,
    visible: false,
    text: '',
    caret: 0,
    hoverKey: -1,
    lastInput: performance.now(),
    lastHover: 0
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, speed, dt) => lerp(a, b, 1 - Math.exp(-speed * dt));
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  let statusTimer = 0;
  function defaultStatus() {
    if (!state.ready) return 'Loading';
    if (state.exploded) return 'Split — click to rebuild';
    if (!state.idleEnabled) return 'Idle split paused';
    return 'Ready';
  }
  function setStatus(message, hold = 1700) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('is-flash');
    void statusEl.offsetWidth;
    statusEl.classList.add('is-flash');
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      if (statusEl.textContent === message) statusEl.textContent = defaultStatus();
    }, hold);
  }

  function isEditable(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function labelFor(key) {
    switch (key) {
      case 'Space': return 'space';
      case 'Backspace': return 'backspace';
      case 'Enter': return 'enter';
      case '<>|': return '< > |';
      case 'AltGr': return 'alt gr';
      default: return key;
    }
  }

  /* Scene handles, filled once the model is ready. */
  const sceneState = {
    renderer: null,
    scene: null,
    camera: null,
    model: null,
    topMesh: null,
    knobMeshes: [],
    keys: [],
    keyIndex: new Map(),
    keyData: null,
    keyTex: null,
    keyTopY: 0,
    keyPlane: null,
    holo: null,
    holoCtx: null,
    holoTex: null,
    holoMat: null,
    beamMat: null,
    particles: null,
    particleData: null,
    shadow: null,
    cameraTarget: new THREE.Vector3(0, 0.55, 0),
    cameraDir: new THREE.Vector3(0, 0.62, 1).normalize(),
    pointer: new THREE.Vector2(0, 0),
    pointerPx: new THREE.Vector2(0, 0),
    raycaster: new THREE.Raycaster(),
    clock: new THREE.Clock(),
    lastFrame: 0,
    controlsReady: false
  };

  /* ----------------------------------------------------------
     TEXTURE HELPERS
     ---------------------------------------------------------- */
  function makeShadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
    g.addColorStop(0, 'rgba(0, 0, 0, .82)');
    g.addColorStop(0.46, 'rgba(0, 0, 0, .44)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeDotTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.35, 'rgba(255, 255, 255, .7)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeBeamTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, 'rgba(201, 178, 255, .46)');
    g.addColorStop(0.35, 'rgba(201, 178, 255, .18)');
    g.addColorStop(1, 'rgba(201, 178, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeHoloTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return { canvas: c, ctx, tex };
  }

  /* ----------------------------------------------------------
     SCENE
     ---------------------------------------------------------- */
  function initScene() {
    const s = sceneState;

    s.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    s.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    s.renderer.outputColorSpace = THREE.SRGBColorSpace;
    s.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    s.renderer.toneMappingExposure = 1.08;
    s.renderer.setClearColor(0x000000, 0);

    s.scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(s.renderer);
    const room = new RoomEnvironment();
    s.scene.environment = pmrem.fromScene(room, 0.045).texture;
    room.dispose();
    pmrem.dispose();

    s.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    s.camera.position.set(0, 6.2, 9.4);

    s.scene.add(new THREE.HemisphereLight('#e8e4ff', '#08080b', 1.55));

    const keyLight = new THREE.DirectionalLight('#fff3e6', 2.7);
    keyLight.position.set(-5, 9, 7);
    s.scene.add(keyLight);

    const rimLight = new THREE.PointLight('#c9b2ff', 70, 34, 2);
    rimLight.position.set(5.5, 4.2, -6.5);
    s.scene.add(rimLight);

    const fillLight = new THREE.PointLight('#6a48e0', 34, 28, 2);
    fillLight.position.set(-6, 2.4, 4);
    s.scene.add(fillLight);

    /* Soft contact shadow so the board sits in the stage. */
    const shadowMat = new THREE.MeshBasicMaterial({
      map: makeShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.9
    });
    s.shadow = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_WIDTH * 1.22, 5.2), shadowMat);
    s.shadow.rotation.x = -Math.PI / 2;
    s.shadow.position.y = -0.012;
    s.shadow.renderOrder = 1;
    s.scene.add(s.shadow);

    /* Hologram face + emitter beam. */
    const holo = makeHoloTexture();
    s.holoCtx = holo.ctx;
    s.holoTex = holo.tex;
    s.holoMat = new THREE.MeshBasicMaterial({
      map: holo.tex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    s.holo = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 1.48), s.holoMat);
    s.holo.position.set(0, 2.85, 0.15);
    s.holo.renderOrder = 8;
    s.scene.add(s.holo);

    s.beamMat = new THREE.MeshBasicMaterial({
      map: makeBeamTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 2.9), s.beamMat);
    beam.position.set(0, 1.48, 0.15);
    beam.renderOrder = 7;
    s.scene.add(beam);
    s.beam = beam;

    /* Drifting motes between the board and the hologram. */
    const COUNT = 150;
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4.9;
      positions[i * 3 + 1] = 0.35 + Math.random() * 3.1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
      speeds[i] = 0.08 + Math.random() * 0.2;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      map: makeDotTexture(),
      color: '#c9b2ff',
      size: 0.055,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false
    });
    s.particles = new THREE.Points(pGeo, pMat);
    s.particles.renderOrder = 6;
    s.scene.add(s.particles);
    s.particleData = { count: COUNT, speeds, positions };

    s.clock = new THREE.Clock();
    frameCamera();
  }

  function frameCamera() {
    const s = sceneState;
    if (!s.camera) return;
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const aspect = clamp(w / h, 0.45, 3.2);
    s.camera.aspect = aspect;

    const vFov = THREE.MathUtils.degToRad(s.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distW = (BOARD_WIDTH * 1.2 * 0.5) / Math.tan(hFov / 2);
    const distH = (4.7 * 0.5) / Math.tan(vFov / 2);
    const dist = Math.max(distW, distH) * 1.04;

    s.camera.position.copy(s.cameraTarget).addScaledVector(s.cameraDir, dist);
    s.camera.lookAt(s.cameraTarget);
    s.camera.updateProjectionMatrix();
    s.renderer.setSize(w, h, false);
  }

  /* ----------------------------------------------------------
     MODEL LOAD + KEYCAP SPLITTING
     ---------------------------------------------------------- */
  function setProgress(pct) {
    const value = clamp(pct, 0, 100);
    if (loaderFill) loaderFill.style.width = value + '%';
    if (loaderPct) loaderPct.textContent = Math.round(value) + '%';
  }

  function failModel(error) {
    console.warn('[keyboard3d] model failed to load', error);
    state.loading = false;
    if (loaderEl) loaderEl.classList.add('is-error');
    if (loaderMeta) loaderMeta.innerHTML = '<span>3D keyboard unavailable</span>';
    const fallback = keyboard.querySelector('[data-kb-fallback]');
    if (fallback) fallback.hidden = false;
    if (canvas) canvas.hidden = true;
    setStatus('2D mode');
  }

  function startLoading() {
    if (state.loading || state.ready) return;
    state.loading = true;
    try {
      initScene();
    } catch (error) {
      failModel(error);
      return;
    }
    sceneState.lastFrame = performance.now();
    requestAnimationFrame(tick);

    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      gltf => prepareModel(gltf),
      xhr => {
        if (xhr && xhr.total) setProgress((xhr.loaded / xhr.total) * 100);
        else if (xhr && xhr.loaded) setProgress(Math.min(92, xhr.loaded / 260000));
      },
      failModel
    );
  }

  function prepareModel(gltf) {
    const s = sceneState;
    const model = gltf.scene;
    s.model = model;
    s.scene.add(model);
    model.updateMatrixWorld(true);

    /* Normalise to a 10 unit wide board, centred on x/z, resting on y = 0. */
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = BOARD_WIDTH / Math.max(0.001, size.x);
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);

    const box2 = new THREE.Box3().setFromObject(model);
    const center = box2.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box2.min.y;
    model.updateMatrixWorld(true);

    const keys = collectKeycaps(model);
    if (!keys.length) {
      failModel('no keycaps found');
      return;
    }
    s.keys = keys;

    /* One float texture holds a translation and a rotation per key. */
    const count = keys.length;
    const data = new Float32Array(count * 2 * 4);
    const tex = new THREE.DataTexture(data, count, 2, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    s.keyData = data;
    s.keyTex = tex;

    const perMesh = assignKeyAttributes(keys);
    for (const [mesh, rec] of perMesh) {
      const geo = mesh.geometry;
      geo.setAttribute('aKey', new THREE.BufferAttribute(rec.aKey, 1));
      geo.setAttribute('aPivot', new THREE.BufferAttribute(rec.aPivot, 3));
      mesh.material = makeKeyMaterial(mesh.material);
      mesh.frustumCulled = false;
      if (mesh.material && /Keys_Top/i.test(mesh.material.name || '')) s.topMesh = mesh;
    }
    if (!s.topMesh && perMesh.size) s.topMesh = perMesh.keys().next().value;

    model.traverse(o => {
      if (!o.isMesh) return;
      const tag = (o.name || '') + ' ' + (o.material && o.material.name ? o.material.name : '');
      if (/volume/i.test(tag)) s.knobMeshes.push(o);
    });

    /* Where a pointer ray should land when a keycap cannot be hit directly. */
    computeKeyGeometry(keys);

    s.keyIndex.clear();
    for (const key of keys) {
      s.keyIndex.set(key.label, key);
    }

    state.ready = true;
    state.loading = false;
    state.lastInput = performance.now();
    setProgress(100);
    setStatus('Ready', 900);
    drawHolo();
    updateKeyTexture(0);
    if (loaderEl) {
      window.setTimeout(() => loaderEl.classList.add('is-done'), 260);
    }
    rootReady();
  }

  function collectKeycaps(root) {
    const meshes = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const name = o.material && o.material.name;
      if (name === 'Keys_Top' || name === 'Keys_Bottom') meshes.push(o);
    });

    const comps = [];
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      if (!pos) continue;
      const index = geo.index;
      const n = pos.count;
      const parent = new Int32Array(n);
      for (let i = 0; i < n; i++) parent[i] = i;

      const find = a => {
        while (parent[a] !== a) {
          parent[a] = parent[parent[a]];
          a = parent[a];
        }
        return a;
      };
      const union = (a, b) => {
        a = find(a);
        b = find(b);
        if (a !== b) parent[b] = a;
      };

      if (index) {
        const arr = index.array;
        for (let i = 0; i < arr.length; i += 3) {
          union(arr[i], arr[i + 1]);
          union(arr[i + 1], arr[i + 2]);
        }
      }

      const groups = new Map();
      for (let i = 0; i < n; i++) {
        const r = find(i);
        let arr = groups.get(r);
        if (!arr) {
          arr = [];
          groups.set(r, arr);
        }
        arr.push(i);
      }

      for (const verts of groups.values()) {
        if (verts.length < 8) continue;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let sx = 0, sy = 0, sz = 0;
        for (const i of verts) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          sx += x; sy += y; sz += z;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        comps.push({
          mesh,
          verts,
          weight: verts.length,
          cx: sx / verts.length,
          cy: sy / verts.length,
          cz: sz / verts.length,
          minX, maxX, minY, maxY, minZ, maxZ
        });
      }
    }

    /* Components belonging to one cap share a centre; stitch them. */
    const raw = [];
    for (const comp of comps) {
      let best = null;
      let bestDist = 0.8;
      for (const cluster of raw) {
        const d = Math.hypot(cluster.cx - comp.cx, cluster.cz - comp.cz);
        if (d < bestDist) {
          bestDist = d;
          best = cluster;
        }
      }
      if (!best) {
        best = {
          cx: comp.cx, cy: comp.cy, cz: comp.cz, weight: 0,
          minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity, comps: []
        };
        raw.push(best);
      }
      const w = best.weight + comp.weight;
      best.cx = (best.cx * best.weight + comp.cx * comp.weight) / w;
      best.cy = (best.cy * best.weight + comp.cy * comp.weight) / w;
      best.cz = (best.cz * best.weight + comp.cz * comp.weight) / w;
      best.weight = w;
      best.minX = Math.min(best.minX, comp.minX);
      best.maxX = Math.max(best.maxX, comp.maxX);
      best.minY = Math.min(best.minY, comp.minY);
      best.maxY = Math.max(best.maxY, comp.maxY);
      best.minZ = Math.min(best.minZ, comp.minZ);
      best.maxZ = Math.max(best.maxZ, comp.maxZ);
      best.comps.push(comp);
    }

    /* Group clusters into rows. */
    const byZ = raw.slice().sort((a, b) => a.cz - b.cz);
    const rows = [];
    let prevZ = -Infinity;
    for (const key of byZ) {
      let row = rows[rows.length - 1];
      if (!row || key.cz - prevZ > ROW_GAP) {
        row = { keys: [] };
        rows.push(row);
      }
      row.keys.push(key);
      prevZ = key.cz;
    }
    for (const row of rows) row.keys.sort((a, b) => a.cx - b.cx);
    rows.sort((a, b) => a.keys[0].cz - b.keys[0].cz);

    if (rows.length !== ROW_LABELS.length) {
      console.warn('[keyboard3d] expected', ROW_LABELS.length, 'rows, found', rows.length,
        rows.map(r => r.keys.length).join('/'));
    }

    const keys = [];
    rows.forEach((row, rowIndex) => {
      const labels = ROW_LABELS[rowIndex] || [];
      if (labels.length && row.keys.length !== labels.length) {
        console.warn('[keyboard3d] row', rowIndex, 'expected', labels.length, 'keys, found', row.keys.length);
      }
      row.keys.forEach((key, colIndex) => {
        key.index = keys.length;
        key.row = rowIndex;
        key.col = colIndex;
        key.label = labels[colIndex] || 'Key';
        key.pivot = new THREE.Vector3(
          (key.minX + key.maxX) / 2,
          (key.minY + key.maxY) / 2,
          (key.minZ + key.maxZ) / 2
        );
        key.w = key.maxX - key.minX;
        key.d = key.maxZ - key.minZ;
        key.h = key.maxY - key.minY;
        key.curOff = new THREE.Vector3();
        key.curQ = new THREE.Quaternion();
        key.splitOff = new THREE.Vector3();
        key.splitQ = new THREE.Quaternion();
        key.pressUntil = 0;
        key.hoverLift = 0;
        key.splitDelay = 0;
        keys.push(key);
      });
    });

    return keys;
  }

  function assignKeyAttributes(keys) {
    const perMesh = new Map();
    for (const key of keys) {
      for (const comp of key.comps) {
        const mesh = comp.mesh;
        let rec = perMesh.get(mesh);
        if (!rec) {
          const n = mesh.geometry.attributes.position.count;
          rec = {
            aKey: new Float32Array(n).fill(-1),
            aPivot: new Float32Array(n * 3)
          };
          perMesh.set(mesh, rec);
        }
        for (const vi of comp.verts) {
          rec.aKey[vi] = key.index;
          rec.aPivot[vi * 3] = key.pivot.x;
          rec.aPivot[vi * 3 + 1] = key.pivot.y;
          rec.aPivot[vi * 3 + 2] = key.pivot.z;
        }
      }
    }
    return perMesh;
  }

  /* Cache true world-space cap centres. The caps live on a skinned mesh,
     so matrixWorld alone does not put them where they are drawn. */
  function computeKeyGeometry(keys) {
    const s = sceneState;
    const mesh = s.topMesh;
    if (!mesh || !keys.length) return;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const aKey = geo.attributes.aKey;
    if (!pos || !aKey) return;

    mesh.updateMatrixWorld(true);
    s.camera.updateMatrixWorld();
    s.camera.matrixWorldInverse.copy(s.camera.matrixWorld).invert();

    const sums = new Float64Array(keys.length * 4);
    const v = new THREE.Vector3();
    const skinned = mesh.isSkinnedMesh === true
      && !!geo.attributes.skinIndex && !!geo.attributes.skinWeight;

    for (let i = 0; i < pos.count; i++) {
      const ki = aKey.getX(i);
      if (ki < 0 || ki >= keys.length) continue;
      v.fromBufferAttribute(pos, i);
      if (skinned) mesh.applyBoneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      const o = (ki | 0) * 4;
      sums[o] += v.x;
      sums[o + 1] += v.y;
      sums[o + 2] += v.z;
      sums[o + 3] += 1;
    }

    const scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
    const capScale = Math.max(scale.x, scale.z);

    for (const key of keys) {
      const o = key.index * 4;
      if (sums[o + 3] > 0) {
        key.world = new THREE.Vector3(
          sums[o] / sums[o + 3],
          sums[o + 1] / sums[o + 3],
          sums[o + 2] / sums[o + 3]
        );
      } else {
        key.world = key.pivot.clone().applyMatrix4(mesh.matrixWorld);
      }
      key.worldRadius = Math.max(0.08, 0.5 * Math.max(key.w, key.d) * capScale);
    }

    /* Fit a plane through the caps so pointer fallback lands on the board. */
    const p0 = keys[0].world;
    let p1 = null;
    let p2 = null;
    for (let i = 1; i < keys.length; i++) {
      if (keys[i].world.distanceToSquared(p0) > 0.0001) { p1 = keys[i].world; break; }
    }
    if (p1) {
      for (let i = 2; i < keys.length; i++) {
        const test = new THREE.Vector3().subVectors(p1, p0)
          .cross(new THREE.Vector3().subVectors(keys[i].world, p0));
        if (test.lengthSq() > 0.0001) { p2 = keys[i].world; break; }
      }
    }
    if (p1 && p2) {
      const normal = new THREE.Vector3().subVectors(p1, p0)
        .cross(new THREE.Vector3().subVectors(p2, p0))
        .normalize();
      const toCamera = new THREE.Vector3().subVectors(s.camera.position, p0);
      if (normal.dot(toCamera) < 0) normal.negate();
      const centre = p0.clone().add(p1).add(p2).multiplyScalar(1 / 3);
      s.keyPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centre);
      s.keyTopY = centre.y;
    }
  }

  function keyFromHit(hit) {
    const mesh = hit.object;
    const geo = mesh && mesh.geometry;
    const aKey = geo && geo.attributes && geo.attributes.aKey;
    if (!aKey || hit.faceIndex === undefined || hit.faceIndex === null) return null;
    const vi = geo.index ? geo.index.getX(hit.faceIndex * 3) : hit.faceIndex * 3;
    const ki = aKey.getX(vi);
    if (!(ki >= 0) || ki >= sceneState.keys.length) return null;
    return sceneState.keys[ki | 0];
  }

  function nearestKeyWorld(point) {
    let best = null;
    let bestScore = 1;
    for (const key of sceneState.keys) {
      if (!key.world) continue;
      const r = key.worldRadius || 0.2;
      const dx = (key.world.x - point.x) / r;
      const dy = (key.world.y - point.y) / r;
      const dz = (key.world.z - point.z) / r;
      const score = dx * dx + dy * dy + dz * dz;
      if (score < bestScore) {
        bestScore = score;
        best = key;
      }
    }
    return best;
  }

  function makeKeyMaterial(source) {
    const material = source.clone();
    material.onBeforeCompile = shader => {
      shader.uniforms.uKeyData = { value: sceneState.keyTex };
      shader.uniforms.uKeyCount = { value: sceneState.keys.length };
      shader.vertexShader =
        'uniform sampler2D uKeyData;\n' +
        'uniform float uKeyCount;\n' +
        'attribute float aKey;\n' +
        'attribute vec3 aPivot;\n' +
        'vec3 kbRotate(vec4 q, vec3 v) {\n' +
        '  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);\n' +
        '}\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'if (aKey >= 0.0) {\n' +
        '  float kbU = (aKey + 0.5) / uKeyCount;\n' +
        '  vec4 kbOffset = texture2D(uKeyData, vec2(kbU, 0.25));\n' +
        '  vec4 kbQuat = texture2D(uKeyData, vec2(kbU, 0.75));\n' +
        '  vec3 kbLocal = kbRotate(kbQuat, transformed - aPivot);\n' +
        '  transformed = aPivot + kbLocal + kbOffset.xyz;\n' +
        '}'
      );
    };
    material.customProgramCacheKey = () => 'ugly-kb-keycap-1';
    material.needsUpdate = true;
    return material;
  }

  /* ----------------------------------------------------------
     TEXT MODEL
     ---------------------------------------------------------- */
  function afterText() {
    if (output) {
      output.textContent = state.text;
      output.scrollLeft = output.scrollWidth;
      output.classList.remove('is-sent');
    }
    drawHolo();
  }

  function insertText(str) {
    if (!str) return;
    const next = state.text.slice(0, state.caret) + str + state.text.slice(state.caret);
    state.text = next.slice(0, MAX_TEXT);
    state.caret = clamp(state.caret + str.length, 0, state.text.length);
    afterText();
  }

  function backspace() {
    if (state.caret <= 0) return;
    state.text = state.text.slice(0, state.caret - 1) + state.text.slice(state.caret);
    state.caret -= 1;
    afterText();
  }

  function deleteForward() {
    if (state.caret >= state.text.length) return;
    state.text = state.text.slice(0, state.caret) + state.text.slice(state.caret + 1);
    afterText();
  }

  function clearText() {
    state.text = '';
    state.caret = 0;
    afterText();
    setStatus('Cleared');
  }

  function moveCaret(direction) {
    if (direction === 'Left') state.caret = Math.max(0, state.caret - 1);
    if (direction === 'Right') state.caret = Math.min(state.text.length, state.caret + 1);
    if (direction === 'Home') state.caret = 0;
    if (direction === 'End') state.caret = state.text.length;
    drawHolo();
  }

  function send() {
    if (flashEl) {
      flashEl.classList.remove('is-on');
      void flashEl.offsetWidth;
      flashEl.classList.add('is-on');
    }
    if (output) {
      output.classList.add('is-sent');
      window.setTimeout(() => output.classList.remove('is-sent'), 650);
    }
    setStatus(state.text ? 'Sent' : 'Nothing to send');
  }

  /* ----------------------------------------------------------
     HOLOGRAM
     ---------------------------------------------------------- */
  function drawHolo() {
    const s = sceneState;
    const ctx = s.holoCtx;
    if (!ctx) return;

    const W = 1024;
    const H = 256;
    const family = '"Panchang", "Arial Black", sans-serif';
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    if (state.text) {
      let size = 146;
      ctx.font = '600 ' + size + 'px ' + family;
      const maxW = W * 0.84;
      while (size > 56 && ctx.measureText(state.text).width > maxW) {
        size -= 6;
        ctx.font = '600 ' + size + 'px ' + family;
      }
      const totalW = ctx.measureText(state.text).width;
      const startX = (W - totalW) / 2;
      const baseline = H * 0.55;

      ctx.shadowColor = 'rgba(201, 178, 255, .9)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = 'rgba(242, 239, 232, .97)';
      ctx.fillText(state.text, startX, baseline);

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#c9b2ff';
      ctx.fillText(state.text, startX + 2, baseline);
      ctx.globalAlpha = 1;

      if ((performance.now() % 1060) < 680) {
        const prefix = state.text.slice(0, state.caret);
        const caretX = startX + ctx.measureText(prefix).width + 4;
        ctx.fillStyle = '#c9b2ff';
        ctx.fillRect(caretX, baseline - size * 0.52, Math.max(3, size * 0.045), size * 0.94);
      }

      ctx.fillStyle = 'rgba(10, 10, 11, .16)';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(201, 178, 255, 0)');
      g.addColorStop(0.2, 'rgba(201, 178, 255, .42)');
      g.addColorStop(0.8, 'rgba(201, 178, 255, .42)');
      g.addColorStop(1, 'rgba(201, 178, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 14, W, 2);
    }

    s.holoTex.needsUpdate = true;
  }

  /* ----------------------------------------------------------
     SOUND
     ---------------------------------------------------------- */
  let audioCtx = null;

  function initAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx = new Ctx();
    } catch (error) {
      audioCtx = null;
    }
  }

  function thock(isEnter) {
    if (!state.sound) return;
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const base = isEnter ? 120 : 168 + Math.random() * 46;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.58, t + 0.085);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.13);

    const len = Math.floor(audioCtx.sampleRate * 0.045);
    const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1600;
    const ng = audioCtx.createGain();
    ng.gain.value = 0.09;
    noise.connect(hp).connect(ng).connect(audioCtx.destination);
    noise.start(t);
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (soundBtn) soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    if (soundLabel) soundLabel.textContent = state.sound ? 'Sound on' : 'Sound off';
    if (state.sound) {
      initAudio();
      thock(false);
    }
  }

  /* ----------------------------------------------------------
     KEY PRESS / SPLIT
     ---------------------------------------------------------- */
  function findKey(label) {
    if (!label) return null;
    const direct = sceneState.keyIndex.get(label);
    if (direct) return direct;
    const lower = String(label).toLowerCase();
    for (const key of sceneState.keys) {
      if (key.label.toLowerCase() === lower) return key;
    }
    return null;
  }

  function pressKey(key, duration = 115) {
    if (!key) return;
    key.pressUntil = performance.now() + duration;
    state.lastInput = performance.now();
    thock(key.label === 'Enter' || key.label === 'Space');
  }

  function explodeKeys() {
    if (!state.ready || state.exploded || REDUCED || !state.idleEnabled) return;
    state.exploded = true;
    const now = performance.now();
    for (const key of sceneState.keys) {
      const x = key.pivot.x;
      const z = key.pivot.z;
      const len = Math.max(0.001, Math.hypot(x, z));
      const nx = x / len;
      const nz = z / len;
      const radial = 2.1 + Math.random() * 2.7 + len * 0.14;
      key.splitOff.set(
        nx * radial + (Math.random() - 0.5) * 1.5,
        1.7 + Math.random() * 3.3,
        nz * radial + (Math.random() - 0.5) * 1.5
      );
      const axis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      const angle = (0.14 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
      key.splitQ.setFromAxisAngle(axis, angle);
      key.splitAt = now + Math.random() * 210 + key.row * 18;
    }
    setStatus('Idle split — click to rebuild', 2600);
  }

  function assembleKeys(message) {
    if (!state.exploded) return;
    state.exploded = false;
    state.lastInput = performance.now();
    setStatus(message || 'Rebuilding');
  }

  function toggleIdle() {
    state.idleEnabled = !state.idleEnabled;
    state.lastInput = performance.now();
    if (!state.idleEnabled && state.exploded) assembleKeys('Idle split paused');
    setStatus(state.idleEnabled ? 'Idle split on' : 'Idle split paused');
  }

  /* ----------------------------------------------------------
     DYNAMIC PER-KEY TRANSFORM
     ---------------------------------------------------------- */
  const tmpOffset = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const IDENTITY = new THREE.Quaternion();

  function updateKeyTexture(dt) {
    const s = sceneState;
    if (!s.keyData || !s.keyTex) return;
    const now = performance.now();
    const count = s.keys.length;
    const data = s.keyData;
    let moving = false;

    for (let i = 0; i < count; i++) {
      const key = s.keys[i];
      tmpOffset.set(0, 0, 0);
      tmpQuat.copy(IDENTITY);

      if (state.exploded && now >= key.splitAt) {
        const t = clamp((now - key.splitAt) / 620, 0, 1);
        const eased = easeOut(t);
        tmpOffset.copy(key.splitOff).multiplyScalar(eased);
        tmpQuat.copy(key.splitQ);
        if (eased < 1) moving = true;
      }

      if (now < key.pressUntil) {
        tmpOffset.y -= 0.62;
        moving = true;
      }

      const hoverTarget = !state.exploded && state.hoverKey === key.index ? 0.34 : 0;
      key.hoverLift = damp(key.hoverLift, hoverTarget, 15, dt);
      tmpOffset.y += key.hoverLift;
      if (key.hoverLift > 0.002) moving = true;

      const speed = state.exploded ? 7.2 : 11.5;
      const k = 1 - Math.exp(-speed * dt);
      key.curOff.lerp(tmpOffset, k);
      key.curQ.slerp(tmpQuat, k);

      if (key.curOff.lengthSq() > 0.000001 || Math.abs(key.curQ.w) < 0.999999) moving = true;

      const o = i * 4;
      data[o] = key.curOff.x;
      data[o + 1] = key.curOff.y;
      data[o + 2] = key.curOff.z;
      data[o + 3] = 1;

      const q = (count + i) * 4;
      data[q] = key.curQ.x;
      data[q + 1] = key.curQ.y;
      data[q + 2] = key.curQ.z;
      data[q + 3] = key.curQ.w;
    }

    s.keyTex.needsUpdate = true;
    return moving;
  }

  /* ----------------------------------------------------------
     CLICK TYPING
     ---------------------------------------------------------- */
  function clickKey(key) {
    pressKey(key);
    const label = key.label;
    switch (label) {
      case 'Enter': send(); return;
      case 'Backspace': backspace(); return;
      case 'Space': insertText(' '); return;
      case 'Tab': insertText('  '); return;
      case 'Esc': clearText(); return;
      case 'Left':
      case 'Right':
      case 'Home':
      case 'End':
        moveCaret(label);
        return;
      case 'Del': deleteForward(); return;
      case 'Pause': toggleIdle(); return;
      case 'Up':
      case 'Down':
      case 'Ins':
      case 'Caps':
      case 'Ctrl':
      case 'Shift':
      case 'Alt':
      case 'AltGr':
      case 'Win':
      case 'Fn':
      case 'NZXT':
      case 'PrtSc':
      case 'ScrLk':
      case 'PgUp':
      case 'PgDn':
      case 'Menu':
        setStatus(label);
        return;
      default:
        if (/^F\d{1,2}$/.test(label)) {
          setStatus(label);
          return;
        }
        insertText(label === '<>|' ? '<' : label);
    }
  }

  /* ----------------------------------------------------------
     PHYSICAL KEYBOARD
     ---------------------------------------------------------- */
  function labelFromEvent(event) {
    const k = event.key;
    if (SPECIAL_KEYS[k]) return SPECIAL_KEYS[k];
    if (k.length === 1) {
      const upper = k.toUpperCase();
      if (/^[A-Z]$/.test(upper)) return upper;
      return SHIFT_TO_BASE[k] || k;
    }
    return null;
  }

  function onKeyDown(event) {
    if (!state.ready || !state.visible) return;
    if (isEditable(event.target)) return;
    if (event.key === 'Dead' || event.key === 'Unidentified') return;

    const altGraph = event.getModifierState && event.getModifierState('AltGraph');
    if (!altGraph && (event.metaKey || event.ctrlKey || event.altKey)) return;

    const key = labelFromEvent(event);
    if (key) pressKey(findKey(key));
    state.lastInput = performance.now();
    if (state.exploded) assembleKeys('Rebuilding');

    const k = event.key;
    if (k === 'Backspace') { event.preventDefault(); backspace(); return; }
    if (k === 'Delete') { event.preventDefault(); deleteForward(); return; }
    if (k === 'Enter') { event.preventDefault(); send(); return; }
    if (k === ' ' || k === 'Spacebar') { event.preventDefault(); insertText(' '); return; }
    if (k === 'Tab') { event.preventDefault(); insertText('  '); return; }
    if (k === 'Escape') { event.preventDefault(); clearText(); return; }
    if (k === 'ArrowLeft') { event.preventDefault(); moveCaret('Left'); return; }
    if (k === 'ArrowRight') { event.preventDefault(); moveCaret('Right'); return; }
    if (k === 'Home') { event.preventDefault(); moveCaret('Home'); return; }
    if (k === 'End') { event.preventDefault(); moveCaret('End'); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { event.preventDefault(); return; }
    if (k === 'Pause') { event.preventDefault(); toggleIdle(); return; }
    if (k.length === 1) insertText(k);
  }

  /* ----------------------------------------------------------
     POINTER
     ---------------------------------------------------------- */
  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    sceneState.pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    sceneState.pointerPx.set(x, y);
    sceneState.raycaster.setFromCamera(sceneState.pointer, sceneState.camera);
  }

  function nearestKey(local) {
    let best = null;
    let bestDist = 1;
    for (const key of sceneState.keys) {
      const ax = key.w * 0.5 + 0.16;
      const az = key.d * 0.5 + 0.16;
      const dx = (key.pivot.x - local.x) / ax;
      const dz = (key.pivot.z - local.z) / az;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = key;
      }
    }
    return best;
  }

  function pickAtPointer() {
    const s = sceneState;
    if (!s.camera || !s.topMesh) return null;

    let knobHit = null;
    if (s.knobMeshes.length) {
      const hits = s.raycaster.intersectObjects(s.knobMeshes, false);
      if (hits.length) knobHit = hits[0];
    }

    /* Caps win over the knob: every key must stay clickable even where
       the raised volume knob overlaps the top row on screen. */
    if (!state.exploded) {
      const capHits = s.raycaster.intersectObject(s.topMesh, false);
      if (capHits.length) {
        const direct = keyFromHit(capHits[0]);
        if (direct) return direct;
        const localHit = s.topMesh.worldToLocal(capHits[0].point.clone());
        const key = nearestKey(localHit);
        if (key) return key;
      }
    }

    if (knobHit) return { knob: true };

    const point = new THREE.Vector3();
    if (s.keyPlane) {
      if (!s.raycaster.ray.intersectPlane(s.keyPlane, point)) return null;
    } else {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -s.keyTopY);
      if (!s.raycaster.ray.intersectPlane(plane, point)) return null;
    }

    const worldKey = nearestKeyWorld(point);
    const local = s.topMesh.worldToLocal(point.clone());

    /* Knob sits outside the cap grid, top-left. */
    if (local.x < -15.8 && local.z < -6.7) return { knob: true };

    if (worldKey) return worldKey;

    return nearestKey(local);
  }

  function showTooltip(key) {
    if (!tooltip) return;
    tooltip.textContent = labelFor(key.label);
    tooltip.classList.add('is-on');
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove('is-on');
  }

  function placeTooltip() {
    if (!tooltip) return;
    tooltip.style.left = sceneState.pointerPx.x + 'px';
    tooltip.style.top = sceneState.pointerPx.y + 'px';
  }

  function onPointerMove(event) {
    if (!state.ready) return;
    updatePointer(event);
    const hit = pickAtPointer();
    const key = hit && !hit.knob ? hit : null;

    if (key) {
      if (state.hoverKey !== key.index) {
        state.hoverKey = key.index;
        showTooltip(key);
      }
      placeTooltip();
    } else {
      state.hoverKey = -1;
      hideTooltip();
    }
    canvas.classList.toggle('is-hot', Boolean(hit));

    if (!state.exploded) {
      const now = performance.now();
      if (now - state.lastHover > 80) {
        state.lastInput = now;
        state.lastHover = now;
      }
    }
  }

  function onPointerDown(event) {
    if (!state.ready) return;
    event.preventDefault();
    updatePointer(event);
    if (state.exploded) {
      assembleKeys('Rebuilding');
      state.lastInput = performance.now();
      return;
    }
    const hit = pickAtPointer();
    state.lastInput = performance.now();

    if (!hit) return;
    if (hit.knob) {
      toggleSound();
      setStatus(state.sound ? 'Sound on' : 'Sound off');
      return;
    }
    clickKey(hit);
  }

  function onPointerLeave() {
    state.hoverKey = -1;
    hideTooltip();
    canvas.classList.remove('is-hot');
  }

  /* ----------------------------------------------------------
     RENDER LOOP
     ---------------------------------------------------------- */
  let caretNext = 0;

  function updateAtmosphere(now, dt) {
    const s = sceneState;
    if (!s.holoMat) return;

    const active = state.text.length > 0;
    s.holoMat.opacity = damp(s.holoMat.opacity, active ? 0.96 : 0, 5.4, dt);
    if (active) s.holoMat.opacity *= 0.93 + Math.random() * 0.08;
    s.beamMat.opacity = damp(s.beamMat.opacity, active ? 0.5 : 0.05, 4, dt);
    s.particles.material.opacity = damp(s.particles.material.opacity, active ? 0.82 : 0.24, 3.4, dt);

    s.holo.quaternion.copy(s.camera.quaternion);
    s.beam.quaternion.copy(s.camera.quaternion);

    const data = s.particleData;
    const pos = s.particles.geometry.attributes.position;
    for (let i = 0; i < data.count; i++) {
      let y = pos.getY(i) + data.speeds[i] * dt;
      if (y > 3.75) y = 0.32 + Math.random() * 0.2;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    s.particles.rotation.y = Math.sin(now * 0.00013) * 0.18;

    if (active && now > caretNext) {
      drawHolo();
      caretNext = now + 540;
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const s = sceneState;
    if (!s.renderer || !s.camera) return;

    const dt = Math.min(0.05, Math.max(0, (now - (s.lastFrame || now)) / 1000));
    s.lastFrame = now;
    if (!state.visible || document.hidden) return;

    if (state.ready) {
      updateKeyTexture(dt);
      if (!REDUCED && state.idleEnabled && !state.exploded && now - state.lastInput > IDLE_MS) {
        explodeKeys();
      }
      updateAtmosphere(now, dt);
    }

    s.renderer.render(s.scene, s.camera);
  }

  /* ----------------------------------------------------------
     BOOT
     ---------------------------------------------------------- */
  function rootReady() {
    const s = sceneState;
    if (s.controlsReady) return;
    s.controlsReady = true;

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointercancel', onPointerLeave);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      setStatus('Renderer paused');
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      setStatus('Ready', 900);
    }, false);
    window.addEventListener('keydown', onKeyDown);

    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        initAudio();
        toggleSound();
      });
    }

    if ('fonts' in document) {
      document.fonts.load('600 120px "Panchang"').then(() => drawHolo()).catch(() => {});
    }
    drawHolo();
  }

  let resizeRAF = 0;
  function onResize() {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = 0;
      frameCamera();
    });
  }
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) {
    new ResizeObserver(onResize).observe(stage);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        state.visible = entry.isIntersecting;
        if (entry.isIntersecting) {
          state.lastInput = performance.now();
          startLoading();
        }
      }
    }, { rootMargin: '260px 0px', threshold: 0.01 });
    observer.observe(stage);
  } else {
    state.visible = true;
    startLoading();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      state.lastInput = performance.now();
      sceneState.lastFrame = performance.now();
    }
  });

  if (statusEl) statusEl.textContent = 'Loading';
  drawHolo();

  /* Small debug surface used to verify mapping and run automated clicks. */
  window.__kb = {
    labels: () => sceneState.keys.map(key => key.label),
    state: () => ({
      ready: state.ready,
      exploded: state.exploded,
      idle: state.idleEnabled,
      sound: state.sound,
      text: state.text,
      caret: state.caret,
      keys: sceneState.keys.length,
      visible: state.visible
    }),
    project(label) {
      const key = findKey(label);
      const s = sceneState;
      if (!key || !s.camera || !s.topMesh) return null;
      s.camera.updateMatrixWorld();
      s.camera.matrixWorldInverse.copy(s.camera.matrixWorld).invert();
      const world = key.world || key.pivot.clone().applyMatrix4(s.topMesh.matrixWorld);
      const point = world.clone().project(s.camera);
      const rect = canvas.getBoundingClientRect();
      return {
        label: key.label,
        x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-point.y * 0.5 + 0.5) * rect.height
      };
    },
    explode: () => explodeKeys(),
    assemble: () => assembleKeys('Debug assemble'),
    type(text) {
      for (const ch of String(text)) {
        const label = ch === ' ' ? 'Space' : ch === '\n' ? 'Enter' : ch.toUpperCase();
        const key = findKey(label) || findKey(ch);
        if (key) pressKey(key);
        insertText(ch === '\n' ? ' ' : ch);
      }
    },
    press(label) {
      pressKey(findKey(label));
    },
    touch() {
      state.lastInput = performance.now();
    },
    pickAt(x, y) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      sceneState.pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      sceneState.pointerPx.set(x - rect.left, y - rect.top);
      sceneState.raycaster.setFromCamera(sceneState.pointer, sceneState.camera);
      const hit = pickAtPointer();
      return hit ? (hit.knob ? 'knob' : hit.label) : null;
    },
    debug() {
      const a = findKey('A');
      const s = sceneState;
      return {
        keyTopY: s.keyTopY,
        camera: s.camera ? s.camera.position.toArray() : null,
        matrix: s.topMesh ? s.topMesh.matrixWorld.elements.map(n => +n.toFixed(4)) : null,
        pivotA: a ? { raw: a.pivot.toArray(), world: a.pivot.clone().applyMatrix4(s.topMesh.matrixWorld).toArray() } : null,
        rect: (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()
      };
    },
    toggleIdle: () => toggleIdle()
  };
})();
