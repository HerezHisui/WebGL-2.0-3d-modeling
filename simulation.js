/** Helper method to output an error message to the screen */
function showError(errorText) {
  const errorBoxDiv = document.getElementById('error-box');
  if (errorBoxDiv) {
    const errorSpan = document.createElement('p');
    errorSpan.innerText = errorText;
    errorBoxDiv.appendChild(errorSpan);
  }
  console.error(errorText);
}

//
// --- Small self-contained mat4 math helpers (column-major, WebGL style) ---
//

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function mat4Perspective(fovyRadians, aspect, near, far) {
  const f = 1.0 / Math.tan(fovyRadians / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function mat4LookAt(eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len === 0) { xx = 0; xy = 0; xz = 0; } else { xx /= len; xy /= len; xz /= len; }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const out = new Float32Array(16);
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

// Rotation around Y (spin) plus a small X wobble to feel alive/idle.
function mat4RotationXY(angleX, angleY) {
  const cx = Math.cos(angleX), sx = Math.sin(angleX);
  const cy = Math.cos(angleY), sy = Math.sin(angleY);

  const rx = new Float32Array([
    1, 0, 0, 0,
    0, cx, sx, 0,
    0, -sx, cx, 0,
    0, 0, 0, 1,
  ]);

  const ry = new Float32Array([
    cy, 0, -sy, 0,
    0, 1, 0, 0,
    sy, 0, cy, 0,
    0, 0, 0, 1,
  ]);

  return mat4Multiply(ry, rx);
}

function mat4Translate(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

// Transforms a point (not a direction) by a 4x4 matrix - used to find
// where the orb currently is in world space, so particles can spawn
// exactly there regardless of the wizard's current bob/sway/spin.
function mat4TransformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

//
// --- Procedural wizard geometry ---
//
// Built entirely from two primitives:
//   - a cone frustum (a cylinder and a cone are both special cases of this)
//   - a UV sphere
// so the whole character is generated from loops rather than hand-typed
// vertex lists, the same way the top hat was.
//

function buildWizardGeometry() {
  const positions = [];
  const normals = [];
  const colors = [];
  const emissive = [];
  const eyelidFlag = [];
  const eyelidCenter = [];
  const staffFlag = [];
  const staffPivot = [];
  const indices = [];

  function pushVertex(px, py, pz, nx, ny, nz, color, isEmissive, isEyelid, centerX, centerY, centerZ) {
    positions.push(px, py, pz);
    normals.push(nx, ny, nz);
    colors.push(color[0], color[1], color[2]);
    emissive.push(isEmissive ? 1 : 0);
    eyelidFlag.push(isEyelid ? 1 : 0);
    eyelidCenter.push(centerX || 0, centerY || 0, centerZ || 0);
    staffFlag.push(0);
    staffPivot.push(0, 0, 0);
    return (positions.length / 3) - 1;
  }

  // A frustum's side surface. baseR === topR gives a plain cylinder;
  // topR === 0 gives a cone (used for the hat and the beard).
  function addFrustumSide(baseY, baseR, topY, topR, segments, color, offsetX, offsetZ) {
    offsetX = offsetX || 0;
    offsetZ = offsetZ || 0;
    const dy = topY - baseY;
    const dr = topR - baseR;
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;

      const bx0 = Math.cos(t0) * baseR + offsetX, bz0 = Math.sin(t0) * baseR + offsetZ;
      const bx1 = Math.cos(t1) * baseR + offsetX, bz1 = Math.sin(t1) * baseR + offsetZ;
      const tx0 = Math.cos(t0) * topR + offsetX, tz0 = Math.sin(t0) * topR + offsetZ;
      const tx1 = Math.cos(t1) * topR + offsetX, tz1 = Math.sin(t1) * topR + offsetZ;

      // Outward normal for a frustum side, derived from the cross product
      // of the slant direction and the circumferential direction.
      const n0 = [dy * Math.cos(t0), -dr, dy * Math.sin(t0)];
      const n1 = [dy * Math.cos(t1), -dr, dy * Math.sin(t1)];
      const len0 = Math.hypot(n0[0], n0[1], n0[2]) || 1;
      const len1 = Math.hypot(n1[0], n1[1], n1[2]) || 1;
      n0[0] /= len0; n0[1] /= len0; n0[2] /= len0;
      n1[0] /= len1; n1[1] /= len1; n1[2] /= len1;

      const b0 = pushVertex(bx0, baseY, bz0, n0[0], n0[1], n0[2], color);
      const b1 = pushVertex(bx1, baseY, bz1, n1[0], n1[1], n1[2], color);
      const t1i = pushVertex(tx1, topY, tz1, n1[0], n1[1], n1[2], color);
      const t0i = pushVertex(tx0, topY, tz0, n0[0], n0[1], n0[2], color);

      // Degenerate quad still works fine when topR is 0 (cone apex).
      indices.push(b0, b1, t1i);
      indices.push(b0, t1i, t0i);
    }
  }

  // Flat circular cap (disc), facing up or down.
  function addDiscCap(y, radius, segments, color, facingUp, offsetX, offsetZ) {
    offsetX = offsetX || 0;
    offsetZ = offsetZ || 0;
    const ny = facingUp ? 1 : -1;
    const centerIdx = pushVertex(offsetX, y, offsetZ, 0, ny, 0, color);
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = Math.cos(t0) * radius + offsetX, z0 = Math.sin(t0) * radius + offsetZ;
      const x1 = Math.cos(t1) * radius + offsetX, z1 = Math.sin(t1) * radius + offsetZ;
      const p0 = pushVertex(x0, y, z0, 0, ny, 0, color);
      const p1 = pushVertex(x1, y, z1, 0, ny, 0, color);
      if (facingUp) indices.push(centerIdx, p1, p0);
      else indices.push(centerIdx, p0, p1);
    }
  }

  // UV sphere, centered at (cx, cy, cz).
  function addSphere(cx, cy, cz, radius, latSegments, lonSegments, color, isEmissive, isEyelid) {
    const startIdx = positions.length / 3;
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat / latSegments) * Math.PI; // 0 (top) .. PI (bottom)
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon / lonSegments) * Math.PI * 2;
        const nx = sinT * Math.cos(phi);
        const ny = cosT;
        const nz = sinT * Math.sin(phi);
        pushVertex(cx + nx * radius, cy + ny * radius, cz + nz * radius, nx, ny, nz, color, isEmissive, isEyelid, cx, cy, cz);
      }
    }
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const a = startIdx + lat * (lonSegments + 1) + lon;
        const b = a + lonSegments + 1;
        indices.push(a, b, a + 1);
        indices.push(b, b + 1, a + 1);
      }
    }
  }

  const segments = 28;

  // Colors
  const robeColor = [0.13, 0.2, 0.55];   // deep midnight blue
  const trimColor = [0.85, 0.68, 0.2];   // gold trim
  const skinColor = [0.9, 0.72, 0.58];
  const beardColor = [0.92, 0.92, 0.9];
  const hatColor = [0.1, 0.16, 0.48];
  const staffColor = [0.35, 0.22, 0.12]; // wood
  const orbColor = [0.35, 0.9, 0.95];    // glowing cyan

  // ---- Robe (wide frustum, narrower at the shoulders) ----
  addFrustumSide(-1.3, 0.62, 0.85, 0.34, segments, robeColor);
  addDiscCap(-1.3, 0.62, segments, robeColor, false);
  // Gold trim ring at the hem
  addFrustumSide(-1.32, 0.63, -1.22, 0.615, segments, trimColor);

  // ---- Head (sphere sitting on the shoulders) ----
  addSphere(0, 1.08, 0, 0.3, 12, 20, skinColor);

  // ---- Eye whites: small spheres on the face, forward-facing. Their
  // local positions are returned below so the render loop can compute
  // where the tracking pupils should sit relative to them each frame. ----
  const eyeWhiteColor = [0.95, 0.94, 0.88];
  const eyeSockets = [
    { x: -0.115, y: 1.14, z: 0.27 },
    { x: 0.115, y: 1.14, z: 0.27 },
  ];
  for (const socket of eyeSockets) {
    addSphere(socket.x, socket.y, socket.z, 0.075, 8, 12, eyeWhiteColor, false, true);
  }

  // ---- Beard: three tapering stages narrowing to a point, pulled
  // forward (+Z) so it hangs in front of the robe collar instead of
  // being swallowed by it ----
  const beardZ = 0.16;
  addDiscCap(1.0, 0.23, segments, beardColor, true, 0, beardZ);
  addFrustumSide(0.72, 0.21, 1.0, 0.23, segments, beardColor, 0, beardZ);
  addFrustumSide(0.42, 0.13, 0.72, 0.21, segments, beardColor, 0, beardZ);
  addFrustumSide(0.14, 0.0, 0.42, 0.13, segments, beardColor, 0, beardZ);

  // ---- Wizard hat: brim + tall cone, sitting on the head ----
  addDiscCap(1.28, 0.58, segments, hatColor, true);
  addFrustumSide(1.28, 0.34, 2.35, 0.0, segments, hatColor);
  addFrustumSide(1.4, 0.36, 1.5, 0.355, segments, trimColor); // hat band

  // ---- Staff: held beside the body, with a glowing orb on top ----
  const staffX = 0.62;
  const staffStartIdx = positions.length / 3;
  addFrustumSide(-1.3, 0.045, 1.55, 0.045, 16, staffColor, staffX, 0);
  addSphere(staffX, 1.62, 0, 0.14, 10, 16, orbColor, true);
  const staffEndIdx = positions.length / 3;

  // Pivot roughly at hand-grip height, so on cast the staff swings up and
  // forward around this point instead of rotating around its base or tip.
  const staffPivotPoint = { x: staffX, y: 0.25, z: 0 };
  for (let i = staffStartIdx; i < staffEndIdx; i++) {
    staffFlag[i] = 1;
    staffPivot[i * 3] = staffPivotPoint.x;
    staffPivot[i * 3 + 1] = staffPivotPoint.y;
    staffPivot[i * 3 + 2] = staffPivotPoint.z;
  }

  return { positions, normals, colors, emissive, eyelidFlag, eyelidCenter, staffFlag, staffPivot, indices, staffX, eyeSockets, staffPivotPoint };
}

// Rotates a point around a pivot on the X-axis by the given angle -
// mirrors the staff-tilt rotation done in the vertex shader, so JS-side
// code (particle spawning) can find where the orb actually is once tilted.
function rotateAroundPivotX(point, pivot, angle) {
  const ox = point[0] - pivot.x;
  const oy = point[1] - pivot.y;
  const oz = point[2] - pivot.z;
  const s = Math.sin(angle), c = Math.cos(angle);
  const newY = oy * c - oz * s;
  const newZ = oy * s + oz * c;
  return [pivot.x + ox, pivot.y + newY, pivot.z + newZ];
}

function livingWizard() {
  const canvas = document.getElementById('demo-canvas');
  if (!canvas) {
    showError('Could not find HTML canvas element - check for typos, or loading JavaScript file too early');
    return;
  }
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    const isWebGl1Supported = !!(document.createElement('canvas')).getContext('webgl');
    if (isWebGl1Supported) {
      showError('WebGL 1 is supported, but not v2 - try using a different device or browser');
    } else {
      showError('WebGL is not supported on this device - try using a different device or browser');
    }
    return;
  }

  const wizard = buildWizardGeometry();

  // ---------- BUFFER CREATION ----------
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wizard.positions), gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wizard.normals), gl.STATIC_DRAW);

  // Colors: packed as a Uint8Array (0-255) instead of Float32 (0.0-1.0).
  // This is the "senior insight" byte-packing optimization - it uses a
  // quarter of the VRAM/bandwidth of the float version. The `normalized:
  // true` flag passed to vertexAttribPointer below tells the GPU to map
  // these 0-255 bytes back to a 0.0-1.0 float range inside the shader.
  const colorBytes = new Uint8Array(wizard.colors.length);
  for (let i = 0; i < wizard.colors.length; i++) {
    colorBytes[i] = Math.round(wizard.colors[i] * 255);
  }
  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colorBytes, gl.STATIC_DRAW);

  const emissiveBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, emissiveBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wizard.emissive), gl.STATIC_DRAW);

  const eyelidFlagBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, eyelidFlagBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wizard.eyelidFlag), gl.STATIC_DRAW);

  const eyelidCenterBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, eyelidCenterBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wizard.eyelidCenter), gl.STATIC_DRAW);

  const staffFlagBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, staffFlagBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wizard.staffFlag), gl.STATIC_DRAW);

  const staffPivotBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, staffPivotBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wizard.staffPivot), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(wizard.indices), gl.STATIC_DRAW);

  // ---------- SHADERS ----------
  const vertexShaderSourceCode = `#version 300 es
  precision mediump float;

  in vec3 vertexPosition;
  in vec3 vertexNormal;
  in vec3 vertexColor;
  in float vertexEmissive;
  in float vertexEyelidFlag;
  in vec3 vertexEyelidCenter;
  in float vertexStaffFlag;
  in vec3 vertexStaffPivot;

  uniform mat4 uModel;
  uniform mat4 uViewProjection;
  uniform float uBlink;
  uniform float uStaffTilt;

  out vec3 fragmentColor;
  out vec3 fragmentNormal;
  out float fragmentEmissive;

  void main() {
    fragmentColor = vertexColor;
    fragmentEmissive = vertexEmissive;
    // Model matrix is rotation + translation only (no scale), so
    // transforming normals by it directly is safe.
    fragmentNormal = mat3(uModel) * vertexNormal;

    // Blink: eyelid-tagged vertices (the eye-white spheres) flatten
    // toward their own socket center vertically as uBlink rises toward
    // 1, simulating an eyelid closing. Everything else is unaffected.
    vec3 localPos = vertexPosition;
    if (vertexEyelidFlag > 0.5) {
      localPos.y = vertexEyelidCenter.y + (vertexPosition.y - vertexEyelidCenter.y) * (1.0 - uBlink);
    }

    // Cast flourish: staff+orb vertices swing around a hand-height pivot
    // from resting vertical to pointing forward as uStaffTilt rises.
    if (vertexStaffFlag > 0.5) {
      vec3 offset = localPos - vertexStaffPivot;
      float s = sin(uStaffTilt);
      float c = cos(uStaffTilt);
      float newY = offset.y * c - offset.z * s;
      float newZ = offset.y * s + offset.z * c;
      localPos = vertexStaffPivot + vec3(offset.x, newY, newZ);
    }

    gl_Position = uViewProjection * uModel * vec4(localPos, 1.0);
  }`;

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSourceCode);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    showError(`Failed to compile vertex shader: ${gl.getShaderInfoLog(vertexShader)}`);
    return;
  }

  const fragmentShaderSourceCode = `#version 300 es
  precision mediump float;

  in vec3 fragmentColor;
  in vec3 fragmentNormal;
  in float fragmentEmissive;
  out vec4 outputColor;

  uniform float uCastPulse;
  uniform float uTime;

  void main() {
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.35));
    float diffuse = max(dot(normalize(fragmentNormal), lightDir), 0.0);
    float ambient = 0.35;
    vec3 lit = fragmentColor * (ambient + diffuse * 0.7);

    // Only the orb's vertices carry fragmentEmissive = 1, so this glow
    // boost has no effect on the rest of the wizard.
    // Fire-like gradient: dim ember red at low heat, hot orange in the
    // middle, white-hot at peak intensity - with a slight flicker so it
    // doesn't look like a flat, static light.
    float flicker = 0.85 + 0.15 * sin(uTime * 19.0) * sin(uTime * 7.3);
    float heat = clamp(uCastPulse * flicker, 0.0, 1.0);

    vec3 emberRed = vec3(0.55, 0.05, 0.0);
    vec3 hotOrange = vec3(1.0, 0.35, 0.05);
    vec3 whiteHot = vec3(1.0, 0.92, 0.65);

    vec3 fireColor = heat < 0.5
      ? mix(emberRed, hotOrange, heat * 2.0)
      : mix(hotOrange, whiteHot, (heat - 0.5) * 2.0);

    vec3 glow = fireColor * fragmentEmissive * heat * 1.8;
    outputColor = vec4(lit + glow, 1.0);
  }`;

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSourceCode);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    showError(`Failed to compile fragment shader: ${gl.getShaderInfoLog(fragmentShader)}`);
    return;
  }

  const wizardProgram = gl.createProgram();
  gl.attachShader(wizardProgram, vertexShader);
  gl.attachShader(wizardProgram, fragmentShader);
  gl.linkProgram(wizardProgram);
  if (!gl.getProgramParameter(wizardProgram, gl.LINK_STATUS)) {
    showError(`Failed to link GPU program: ${gl.getProgramInfoLog(wizardProgram)}`);
    return;
  }

  // ---------- ATTRIBUTE / UNIFORM LOCATIONS ----------
  const vertexPositionAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexPosition');
  const vertexNormalAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexNormal');
  const vertexColorAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexColor');
  const vertexEmissiveAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexEmissive');
  const vertexEyelidFlagAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexEyelidFlag');
  const vertexEyelidCenterAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexEyelidCenter');
  const vertexStaffFlagAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexStaffFlag');
  const vertexStaffPivotAttributeLocation = gl.getAttribLocation(wizardProgram, 'vertexStaffPivot');
  if (vertexPositionAttributeLocation < 0 || vertexNormalAttributeLocation < 0 || vertexColorAttributeLocation < 0 || vertexEmissiveAttributeLocation < 0 || vertexEyelidFlagAttributeLocation < 0 || vertexEyelidCenterAttributeLocation < 0 || vertexStaffFlagAttributeLocation < 0 || vertexStaffPivotAttributeLocation < 0) {
    showError('Failed to get one or more attribute locations');
    return;
  }

  const modelUniformLocation = gl.getUniformLocation(wizardProgram, 'uModel');
  const viewProjectionUniformLocation = gl.getUniformLocation(wizardProgram, 'uViewProjection');
  const castPulseUniformLocation = gl.getUniformLocation(wizardProgram, 'uCastPulse');
  const timeUniformLocation = gl.getUniformLocation(wizardProgram, 'uTime');
  const blinkUniformLocation = gl.getUniformLocation(wizardProgram, 'uBlink');
  const staffTiltUniformLocation = gl.getUniformLocation(wizardProgram, 'uStaffTilt');

  console.log('WebGL resources successfully initialized! Wizard ready 🧙');

  // ---------- PARTICLE SYSTEM (ember burst on cast) ----------
  // A separate, minimal shader program that draws gl.POINTS as soft round
  // glowing sprites, colored along the same heat gradient as the orb.
  const particleVertexSource = `#version 300 es
  precision mediump float;
  in vec3 particlePosition;
  in float particleAge; // 0 = just spawned, 1 = fully faded
  uniform mat4 uViewProjection;
  out float vAge;
  void main() {
    vAge = particleAge;
    gl_Position = uViewProjection * vec4(particlePosition, 1.0);
    gl_PointSize = mix(20.0, 2.0, particleAge);
  }`;

  const particleFragmentSource = `#version 300 es
  precision mediump float;
  in float vAge;
  out vec4 outputColor;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float edgeFade = smoothstep(0.5, 0.0, d);
    float alpha = (1.0 - vAge) * edgeFade;

    float heat = 1.0 - vAge;
    vec3 emberRed = vec3(0.55, 0.05, 0.0);
    vec3 hotOrange = vec3(1.0, 0.35, 0.05);
    vec3 whiteHot = vec3(1.0, 0.92, 0.65);
    vec3 color = heat < 0.5
      ? mix(emberRed, hotOrange, heat * 2.0)
      : mix(hotOrange, whiteHot, (heat - 0.5) * 2.0);

    outputColor = vec4(color, alpha);
  }`;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      showError(`Failed to compile particle shader: ${gl.getShaderInfoLog(shader)}`);
      return null;
    }
    return shader;
  }

  const particleVS = compileShader(gl.VERTEX_SHADER, particleVertexSource);
  const particleFS = compileShader(gl.FRAGMENT_SHADER, particleFragmentSource);
  const particleProgram = gl.createProgram();
  gl.attachShader(particleProgram, particleVS);
  gl.attachShader(particleProgram, particleFS);
  gl.linkProgram(particleProgram);
  if (!gl.getProgramParameter(particleProgram, gl.LINK_STATUS)) {
    showError(`Failed to link particle GPU program: ${gl.getProgramInfoLog(particleProgram)}`);
    return;
  }

  const particlePositionAttrLoc = gl.getAttribLocation(particleProgram, 'particlePosition');
  const particleAgeAttrLoc = gl.getAttribLocation(particleProgram, 'particleAge');
  const particleViewProjectionUniformLoc = gl.getUniformLocation(particleProgram, 'uViewProjection');

  const particlePositionBuffer = gl.createBuffer();
  const particleAgeBuffer = gl.createBuffer();

  const particleVAO = gl.createVertexArray();
  gl.bindVertexArray(particleVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, particlePositionBuffer);
  gl.enableVertexAttribArray(particlePositionAttrLoc);
  gl.vertexAttribPointer(particlePositionAttrLoc, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, particleAgeBuffer);
  gl.enableVertexAttribArray(particleAgeAttrLoc);
  gl.vertexAttribPointer(particleAgeAttrLoc, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Live particle state - plain JS objects, re-simulated every frame and
  // re-uploaded to the GPU as small dynamic buffers.
  let particles = [];
  const MAX_PARTICLES = 400;

  function spawnEmberBurst(worldX, worldY, worldZ) {
    const count = 50;
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.4;
      const life = 0.7 + Math.random() * 0.6;
      particles.push({
        x: worldX, y: worldY, z: worldZ,
        vx: Math.cos(angle) * speed * (0.4 + Math.random() * 0.6),
        vy: 1.0 + Math.random() * 2.0,
        vz: Math.sin(angle) * speed * (0.4 + Math.random() * 0.6),
        maxLife: life,
        life: life,
      });
    }
  }

  // ---------- EYE TRACKING (pupils that look toward the camera) ----------
  // A tiny, separate point-sprite shader for two opaque dark dots. Their
  // world position is recomputed every frame in the render loop based on
  // the direction from each eye socket to the current camera position.
  const eyeVertexSource = `#version 300 es
  precision mediump float;
  in vec3 pupilPosition;
  uniform mat4 uViewProjection;
  void main() {
    gl_Position = uViewProjection * vec4(pupilPosition, 1.0);
    gl_PointSize = 12.0;
  }`;

  const eyeFragmentSource = `#version 300 es
  precision mediump float;
  out vec4 outputColor;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    if (length(uv) > 0.5) discard;
    outputColor = vec4(0.05, 0.04, 0.04, 1.0);
  }`;

  const eyeVS = compileShader(gl.VERTEX_SHADER, eyeVertexSource);
  const eyeFS = compileShader(gl.FRAGMENT_SHADER, eyeFragmentSource);
  const eyeProgram = gl.createProgram();
  gl.attachShader(eyeProgram, eyeVS);
  gl.attachShader(eyeProgram, eyeFS);
  gl.linkProgram(eyeProgram);
  if (!gl.getProgramParameter(eyeProgram, gl.LINK_STATUS)) {
    showError(`Failed to link eye GPU program: ${gl.getProgramInfoLog(eyeProgram)}`);
    return;
  }

  const pupilPositionAttrLoc = gl.getAttribLocation(eyeProgram, 'pupilPosition');
  const eyeViewProjectionUniformLoc = gl.getUniformLocation(eyeProgram, 'uViewProjection');

  const pupilPositionBuffer = gl.createBuffer();
  const eyeVAO = gl.createVertexArray();
  gl.bindVertexArray(eyeVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, pupilPositionBuffer);
  gl.enableVertexAttribArray(pupilPositionAttrLoc);
  gl.vertexAttribPointer(pupilPositionAttrLoc, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // How far the pupil can drift from the socket's center, and how far in
  // front of the eye-white surface it sits (avoids z-fighting).
  const pupilDriftRadius = 0.062;
  const pupilForwardOffset = 0.095;
  const wizardVAO = gl.createVertexArray();
  gl.bindVertexArray(wizardVAO);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(vertexPositionAttributeLocation);
  gl.vertexAttribPointer(vertexPositionAttributeLocation, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.enableVertexAttribArray(vertexNormalAttributeLocation);
  gl.vertexAttribPointer(vertexNormalAttributeLocation, 3, gl.FLOAT, false, 0, 0);

  // Color attribute is read from the Uint8Array buffer as UNSIGNED_BYTE,
  // with normalized = true so the GPU rescales [0, 255] -> [0.0, 1.0]
  // before it ever reaches vertexColor in the shader.
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(vertexColorAttributeLocation);
  gl.vertexAttribPointer(vertexColorAttributeLocation, 3, gl.UNSIGNED_BYTE, true, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, emissiveBuffer);
  gl.enableVertexAttribArray(vertexEmissiveAttributeLocation);
  gl.vertexAttribPointer(vertexEmissiveAttributeLocation, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, eyelidFlagBuffer);
  gl.enableVertexAttribArray(vertexEyelidFlagAttributeLocation);
  gl.vertexAttribPointer(vertexEyelidFlagAttributeLocation, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, eyelidCenterBuffer);
  gl.enableVertexAttribArray(vertexEyelidCenterAttributeLocation);
  gl.vertexAttribPointer(vertexEyelidCenterAttributeLocation, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, staffFlagBuffer);
  gl.enableVertexAttribArray(vertexStaffFlagAttributeLocation);
  gl.vertexAttribPointer(vertexStaffFlagAttributeLocation, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, staffPivotBuffer);
  gl.enableVertexAttribArray(vertexStaffPivotAttributeLocation);
  gl.vertexAttribPointer(vertexStaffPivotAttributeLocation, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  gl.bindVertexArray(null);

  // ---------- ONE-TIME SETUP ----------
  gl.useProgram(wizardProgram);
  gl.bindVertexArray(wizardVAO);
  gl.enable(gl.DEPTH_TEST);

  const target = [0, 0.5, 0];
  const up = [0, 1, 0];

  // ---------- INTERACTIVE ORBIT CAMERA + CLICK-TO-CAST ----------
  // Drag rotates the camera around the wizard, scroll/pinch zooms, and a
  // quick click (drag distance below the threshold) triggers a spell-cast
  // flare on the staff orb.
  let cameraYaw = 0.6;
  let cameraPitch = 0.3;
  let cameraDistance = 5.2;
  const minDistance = 2.6;
  const maxDistance = 9.0;

  let isDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let dragDistance = 0;
  let lastInteractionTime = 0;
  let lastCastTime = -999;
  let lastSpawnedCastTime = -999;
  let nextBlinkTime = performance.now() + 1500 + Math.random() * 2500;
  const blinkDuration = 220; // ms for a full close-and-open cycle
  let previousFrameTime = null;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    dragDistance = 0;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  });

  // Raw cursor position in normalized device coords (-1..1), updated on
  // every hover - this drives eye tracking independently of camera drag.
  let mouseNDCX = 0;
  let mouseNDCY = 0;

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseNDCX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDCY = ((e.clientY - rect.top) / rect.height) * 2 - 1;

    if (!isDragging) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    dragDistance += Math.hypot(dx, dy);
    cameraYaw -= dx * 0.008;
    cameraPitch = clamp(cameraPitch - dy * 0.008, -1.15, 1.15);
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
    lastInteractionTime = performance.now();
    // A short drag counts as a "click" - cast a spell.
    if (dragDistance < 6) {
      lastCastTime = performance.now();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraDistance = clamp(cameraDistance + e.deltaY * 0.0035, minDistance, maxDistance);
    lastInteractionTime = performance.now();
  }, { passive: false });

  // Small on-screen hint so it's obvious the model is interactive.
  if (!document.getElementById('wizard-hint')) {
    const hint = document.createElement('div');
    hint.id = 'wizard-hint';
    hint.textContent = 'drag to rotate · scroll to zoom · click to cast';
    hint.style.position = 'fixed';
    hint.style.bottom = '10px';
    hint.style.left = '12px';
    hint.style.color = '#999';
    hint.style.fontFamily = 'system-ui, sans-serif';
    hint.style.fontSize = '12px';
    hint.style.letterSpacing = '0.02em';
    hint.style.pointerEvents = 'none';
    document.body.appendChild(hint);
  }

  // ---------- RENDER LOOP ----------
  function render(timeMs) {
    const time = timeMs * 0.001;
    const dt = previousFrameTime === null ? 0 : Math.min(0.05, time - previousFrameTime);
    previousFrameTime = time;

    const displayWidth = canvas.clientWidth || canvas.width || 300;
    const displayHeight = canvas.clientHeight || canvas.height || 150;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    // The camera itself no longer auto-orbits - the wizard's own idle
    // body spin (below, via spinY) provides the ambient motion instead.
    // This keeps the camera fixed relative to the world, so as his body
    // turns, the eye-tracking compensation is actually visible - if the
    // camera also drifted at a similar rate, the two would nearly cancel
    // out and the eyes would barely seem to move at all.

    const eye = [
      target[0] + cameraDistance * Math.cos(cameraPitch) * Math.sin(cameraYaw),
      target[1] + cameraDistance * Math.sin(cameraPitch),
      target[2] + cameraDistance * Math.cos(cameraPitch) * Math.cos(cameraYaw),
    ];

    const viewMatrix = mat4LookAt(eye, target, up);
    const projectionMatrix = mat4Perspective(
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      100
    );
    const viewProjectionMatrix = mat4Multiply(projectionMatrix, viewMatrix);

    // "Living" idle motion: gentle bob, slight sway, slow continuous turn.
    const bobY = Math.sin(time * 1.4) * 0.06;
    const swayX = Math.sin(time * 0.9) * 0.04;
    const spinY = time * 0.4;

    // Staff points forward on cast: quick raise, brief hold, then eases
    // back down to resting vertical.
    const sinceCast = (performance.now() - lastCastTime) / 1000;
    const staffRaiseDuration = 0.15;
    const staffHoldDuration = 0.35;
    const staffLowerDuration = 0.5;
    const maxStaffTilt = (80 * Math.PI) / 180; // radians
    let staffRaise = 0;
    if (sinceCast >= 0 && sinceCast < staffRaiseDuration + staffHoldDuration + staffLowerDuration) {
      if (sinceCast < staffRaiseDuration) {
        staffRaise = sinceCast / staffRaiseDuration;
      } else if (sinceCast < staffRaiseDuration + staffHoldDuration) {
        staffRaise = 1;
      } else {
        staffRaise = 1 - (sinceCast - staffRaiseDuration - staffHoldDuration) / staffLowerDuration;
      }
    }
    const staffTilt = staffRaise * maxStaffTilt;

    // Spell-cast flare: doesn't start until the staff has finished
    // pointing forward, so the glow and ember burst read as a
    // consequence of the gesture rather than happening simultaneously.
    const sinceFlare = sinceCast - staffRaiseDuration;
    const castPulse = sinceFlare >= 0 && sinceFlare < 1.4
      ? Math.min(1, sinceFlare * 10) * Math.exp(-sinceFlare * 2.5)
      : 0;
    const castHop = sinceFlare >= 0 && sinceFlare < 0.6
      ? Math.sin(Math.min(sinceFlare, 0.6) / 0.6 * Math.PI) * 0.18
      : 0;

    const rotationMatrix = mat4RotationXY(swayX, spinY);
    const translationMatrix = mat4Translate(0, bobY + castHop, 0);
    const modelMatrix = mat4Multiply(translationMatrix, rotationMatrix);

    // Ember burst now spawns once the flare itself starts (i.e. after the
    // staff has finished pointing forward), from the orb's actual tilted
    // position rather than its resting spot beside the body.
    if (lastCastTime !== lastSpawnedCastTime && sinceFlare >= 0 && sinceFlare < 0.1) {
      const orbLocalPos = rotateAroundPivotX([wizard.staffX, 1.62, 0], wizard.staffPivotPoint, staffTilt);
      const orbWorldPos = mat4TransformPoint(modelMatrix, orbLocalPos[0], orbLocalPos[1], orbLocalPos[2]);
      spawnEmberBurst(orbWorldPos[0], orbWorldPos[1], orbWorldPos[2]);
      lastSpawnedCastTime = lastCastTime;
    }

    // Integrate particle physics (simple gravity + fade) and drop dead ones.
    const gravity = 2.4;
    for (const p of particles) {
      p.vy -= gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    // Blink: a quick close-then-open triangle wave, on a randomized
    // schedule so it doesn't feel mechanically periodic.
    const now = performance.now();
    let blinkAmount = 0;
    if (now >= nextBlinkTime) {
      const elapsedBlink = now - nextBlinkTime;
      if (elapsedBlink < blinkDuration) {
        const half = blinkDuration / 2;
        blinkAmount = elapsedBlink < half
          ? elapsedBlink / half
          : 1 - (elapsedBlink - half) / half;
      } else {
        nextBlinkTime = now + 2200 + Math.random() * 3500;
      }
    }

    gl.clearColor(0.04, 0.04, 0.06, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(wizardProgram);
    gl.bindVertexArray(wizardVAO);
    gl.uniformMatrix4fv(viewProjectionUniformLocation, false, viewProjectionMatrix);
    gl.uniformMatrix4fv(modelUniformLocation, false, modelMatrix);
    gl.uniform1f(castPulseUniformLocation, castPulse);
    gl.uniform1f(timeUniformLocation, time);
    gl.uniform1f(blinkUniformLocation, blinkAmount);
    gl.uniform1f(staffTiltUniformLocation, staffTilt);
    gl.drawElements(gl.TRIANGLES, wizard.indices.length, gl.UNSIGNED_SHORT, 0);
    // Clean-slate: unbind immediately after this draw call so no other
    // program can accidentally inherit the wizard's attribute state.
    gl.bindVertexArray(null);

    // Eyes that track the camera: for each socket, find the direction from
    // the socket (in world space) to the camera, then express that
    // direction in the head's own right/up/forward axes (columns of the
    // model matrix) so the pupil drifts correctly even while the wizard
    // is spinning or swaying.
    const rightAxis = [modelMatrix[0], modelMatrix[1], modelMatrix[2]];
    const upAxis = [modelMatrix[4], modelMatrix[5], modelMatrix[6]];
    const forwardAxis = [modelMatrix[8], modelMatrix[9], modelMatrix[10]];

    const pupilPositions = new Float32Array(wizard.eyeSockets.length * 3);
    wizard.eyeSockets.forEach((socket, i) => {
      const socketWorld = mat4TransformPoint(modelMatrix, socket.x, socket.y, socket.z);
      let dx = eye[0] - socketWorld[0];
      let dy = eye[1] - socketWorld[1];
      let dz = eye[2] - socketWorld[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;

      const rightComponent = dx * rightAxis[0] + dy * rightAxis[1] + dz * rightAxis[2];
      const upComponent = dx * upAxis[0] + dy * upAxis[1] + dz * upAxis[2];

      pupilPositions[i * 3] = socketWorld[0]
        + rightAxis[0] * rightComponent * pupilDriftRadius
        + upAxis[0] * upComponent * pupilDriftRadius
        + forwardAxis[0] * pupilForwardOffset;
      pupilPositions[i * 3 + 1] = socketWorld[1]
        + rightAxis[1] * rightComponent * pupilDriftRadius
        + upAxis[1] * upComponent * pupilDriftRadius
        + forwardAxis[1] * pupilForwardOffset;
      pupilPositions[i * 3 + 2] = socketWorld[2]
        + rightAxis[2] * rightComponent * pupilDriftRadius
        + upAxis[2] * upComponent * pupilDriftRadius
        + forwardAxis[2] * pupilForwardOffset;
    });

    if (blinkAmount < 0.8) {
      gl.useProgram(eyeProgram);
      gl.bindVertexArray(eyeVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, pupilPositionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pupilPositions, gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(eyeViewProjectionUniformLoc, false, viewProjectionMatrix);
      gl.drawArrays(gl.POINTS, 0, wizard.eyeSockets.length);
      gl.bindVertexArray(null);
    }

    // Draw the ember particles on top, additively blended, without writing
    // depth (so overlapping embers glow together instead of occluding).
    if (particles.length > 0) {
      const particlePositions = new Float32Array(particles.length * 3);
      const particleAges = new Float32Array(particles.length);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        particlePositions[i * 3] = p.x;
        particlePositions[i * 3 + 1] = p.y;
        particlePositions[i * 3 + 2] = p.z;
        particleAges[i] = 1 - p.life / p.maxLife;
      }

      gl.useProgram(particleProgram);
      gl.bindVertexArray(particleVAO);

      gl.bindBuffer(gl.ARRAY_BUFFER, particlePositionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, particlePositions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, particleAgeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, particleAges, gl.DYNAMIC_DRAW);

      gl.uniformMatrix4fv(particleViewProjectionUniformLoc, false, viewProjectionMatrix);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);

      gl.drawArrays(gl.POINTS, 0, particles.length);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

try {
  livingWizard();
} catch (e) {
  showError(`Uncaught JavaScript exception: ${e}`);
}
