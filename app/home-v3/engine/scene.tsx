"use client";

// =============================================================================
// /home-v3 — the engine room. A WebGL particle field that tells the product's
// story as you scroll: 62 applicants drift as a pile, the scanline reads them,
// and they collapse into a ranked column — 8 lit emerald ("8 worth a screen"),
// one thrown out rose (the flag). Driven by a scroll-progress ref written by
// the GSAP pin in hero-film.tsx; no React re-renders per frame.
//
// Numbers are the product's own sample numbers (62 applicants, 8 worth a
// screen, rank #47 flagged) — nothing invented. Deterministic layout (seeded
// PRNG) so every load and screenshot matches.
// =============================================================================

import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

const APPLICANTS = 62;
const SHORTLIST = 8;
const FLAGGED_RANK = 47; // Vikram's rank in the showcase

// Deterministic PRNG (mulberry32) — stable field across loads.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Applicant particles ----------------------------------------------

const APPLICANT_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uP;
  uniform float uScale;
  attribute vec3 aEnd;
  attribute float aSeed;
  attribute float aDelay;
  attribute float aKind; // 0 rest · 1 shortlist · 2 flagged
  varying float vKind;
  varying float vGlow;
  varying float vMorph;
  varying float vRanked;

  float easeInOut(float t) { return t * t * (3.0 - 2.0 * t); }

  void main() {
    vKind = aKind;

    // Staggered convergence into the ranked column.
    float t0 = 0.40 + aDelay;
    float t1 = 0.82 + aDelay * 0.5;
    float m = easeInOut(clamp((uP - t0) / (t1 - t0), 0.0, 1.0));
    vMorph = m;
    vec3 pos = mix(position, aEnd, m);

    // Idle drift, damped away as the ranking settles.
    float drift = 1.0 - m;
    pos.x += sin(uTime * 0.50 + aSeed * 17.0) * 0.22 * drift;
    pos.y += cos(uTime * 0.42 + aSeed * 29.0) * 0.20 * drift;
    pos.z += sin(uTime * 0.35 + aSeed * 41.0) * 0.18 * drift;

    // The reading scan: a band sweeping top-to-bottom over p ∈ [0.10, 0.46].
    float scanP = clamp((uP - 0.10) / 0.36, 0.0, 1.0);
    float scanOn = step(0.0001, scanP) * (1.0 - step(0.9999, scanP));
    float scanY = mix(5.2, -5.2, scanP);
    vGlow = (1.0 - smoothstep(0.0, 1.0, abs(pos.y - scanY))) * scanOn;

    float ranked = smoothstep(0.80, 0.94, uP);
    vRanked = ranked;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);

    // World-unit point sizes.
    float size = 0.11;
    if (aKind > 1.5)      size = 0.15;
    else if (aKind > 0.5) size = 0.13;
    if (aKind > 0.5) size += ranked * 0.12;                 // the eight light up
    if (aKind > 1.5) size += (0.5 + 0.5 * sin(uTime * 4.0)) * 0.05 * ranked; // flag pulses
    if (aKind < 0.5) size *= 1.0 - 0.5 * m;                 // the rest recede
    size *= 1.0 + vGlow * 0.6;

    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const APPLICANT_FRAG = /* glsl */ `
  precision highp float;
  varying float vKind;
  varying float vGlow;
  varying float vMorph;
  varying float vRanked;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float core = smoothstep(0.5, 0.06, d);
    float halo = smoothstep(0.5, 0.25, d);

    vec3 dim     = vec3(0.55, 0.58, 0.62);
    vec3 emerald = vec3(0.20, 0.83, 0.60);
    vec3 rose    = vec3(0.98, 0.35, 0.48);

    vec3 col;
    float alpha;
    if (vKind > 1.5) {
      col = mix(dim, rose, max(vMorph, vGlow));
      alpha = mix(0.55, 0.95, vMorph);
    } else if (vKind > 0.5) {
      col = mix(dim, emerald, max(vRanked, vGlow * 0.8));
      alpha = mix(0.55, 0.95, vRanked);
    } else {
      col = mix(dim, dim * 0.45, vMorph) + emerald * vGlow * 0.85;
      alpha = mix(0.55, 0.20, vMorph);
    }
    col += emerald * vGlow * 0.6;
    alpha = (alpha + vGlow * 0.35) * (core * 0.85 + halo * 0.15);

    gl_FragColor = vec4(col, alpha);
  }
`;

// ---------- Dust (ambient depth, never ranked) --------------------------------

const DUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute float aSeed;
  void main() {
    vec3 pos = position;
    pos.x += sin(uTime * 0.22 + aSeed * 13.0) * 0.35;
    pos.y += cos(uTime * 0.18 + aSeed * 23.0) * 0.30;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 0.045 * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = /* glsl */ `
  precision highp float;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.1, d);
    gl_FragColor = vec4(vec3(0.6, 0.64, 0.68), 0.16 * disc);
  }
`;

function buildApplicants() {
  const rand = rng(20260703);
  const start = new Float32Array(APPLICANTS * 3);
  const end = new Float32Array(APPLICANTS * 3);
  const seed = new Float32Array(APPLICANTS);
  const delay = new Float32Array(APPLICANTS);
  const kind = new Float32Array(APPLICANTS);

  // Ranks 1..8 form the column; rank 47 is the flag; the rest recede.
  let restIdx = 0;
  for (let i = 0; i < APPLICANTS; i++) {
    const rank = i + 1;
    // Start: a loose ellipsoid pile.
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    const r = 0.35 + Math.pow(rand(), 0.5) * 0.65;
    start[i * 3 + 0] = Math.sin(ph) * Math.cos(th) * 7.2 * r;
    start[i * 3 + 1] = Math.cos(ph) * 3.6 * r;
    start[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 3.0 * r - 1.0;

    seed[i] = rand();
    delay[i] = rand() * 0.10;

    if (rank <= SHORTLIST) {
      kind[i] = 1;
      // The ranked column, front and centre-left.
      end[i * 3 + 0] = -3.4;
      end[i * 3 + 1] = 2.35 - (rank - 1) * 0.68;
      end[i * 3 + 2] = 2.4;
    } else if (rank === FLAGGED_RANK) {
      kind[i] = 2;
      // Thrown out to the right, alone.
      end[i * 3 + 0] = 3.6;
      end[i * 3 + 1] = -1.15;
      end[i * 3 + 2] = 2.1;
    } else {
      kind[i] = 0;
      // A dim disc, far behind.
      const a = (restIdx / (APPLICANTS - SHORTLIST - 1)) * Math.PI * 2;
      const rr = 2.6 + rand() * 4.6;
      end[i * 3 + 0] = Math.cos(a) * rr;
      end[i * 3 + 1] = Math.sin(a) * rr * 0.45 - 0.4;
      end[i * 3 + 2] = -6.5 - rand() * 2.0;
      restIdx++;
    }
  }
  return { start, end, seed, delay, kind };
}

function buildDust(count: number) {
  const rand = rng(477);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3 + 0] = (rand() - 0.5) * 22;
    pos[i * 3 + 1] = (rand() - 0.5) * 12;
    pos[i * 3 + 2] = -2 - rand() * 9;
    seed[i] = rand();
  }
  return { pos, seed };
}

function Field({ progress, reduced, dustCount }: {
  progress: MutableRefObject<number>;
  reduced: boolean;
  dustCount: number;
}) {
  const group = useRef<THREE.Group>(null);
  const smoothP = useRef(reduced ? 1 : 0);
  const { camera } = useThree();

  const applicantGeo = useMemo(() => {
    const { start, end, seed, delay, kind } = buildApplicants();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(start, 3));
    g.setAttribute("aEnd", new THREE.BufferAttribute(end, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
    g.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
    return g;
  }, []);

  const dustGeo = useMemo(() => {
    const { pos, seed } = buildDust(dustCount);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [dustCount]);

  const applicantMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: APPLICANT_VERT,
        fragmentShader: APPLICANT_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uP: { value: reduced ? 1 : 0 },
          uScale: { value: 1000 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [reduced]
  );

  const dustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: { uTime: { value: 0 }, uScale: { value: 1000 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useFrame((state, delta) => {
    const p = reduced ? 1 : progress.current;
    // Ease the scrubbed progress a touch for silkiness.
    smoothP.current += (p - smoothP.current) * Math.min(1, delta * 7);
    const sp = smoothP.current;

    const t = reduced ? 0 : state.clock.elapsedTime;
    const dpr = state.gl.getPixelRatio();
    const fovRad = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const uScale = (state.size.height * dpr * 0.5) / Math.tan(fovRad / 2);

    applicantMat.uniforms.uTime.value = t;
    applicantMat.uniforms.uP.value = sp;
    applicantMat.uniforms.uScale.value = uScale;
    dustMat.uniforms.uTime.value = t;
    dustMat.uniforms.uScale.value = uScale;

    // Gentle dolly-in as the ranking settles + pointer parallax.
    camera.position.z = 13.2 - 2.0 * sp;
    if (group.current && !reduced) {
      const px = state.pointer.x;
      const py = state.pointer.y;
      group.current.rotation.y += (px * 0.10 - group.current.rotation.y) * Math.min(1, delta * 3);
      group.current.rotation.x += (-py * 0.06 - group.current.rotation.x) * Math.min(1, delta * 3);
    }
  });

  return (
    <group ref={group}>
      <points geometry={applicantGeo} material={applicantMat} />
      <points geometry={dustGeo} material={dustMat} />
    </group>
  );
}

export function EngineCanvas({ progress, reduced }: {
  progress: MutableRefObject<number>;
  reduced: boolean;
}) {
  const coarse =
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (
    <Canvas
      camera={{ position: [0, 0, 13.2], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <Field progress={progress} reduced={reduced} dustCount={coarse ? 260 : 600} />
    </Canvas>
  );
}
