import type { Mesh } from "./geometry";

const VERT = `
precision mediump float;
attribute vec3 a_pos;
attribute vec2 a_uv;
attribute float a_shade;
attribute float a_face;
uniform vec2 u_canvas;
uniform vec2 u_origin;
uniform float u_hinge;
uniform float u_shadow;
uniform float u_lift;
uniform float u_focal;
uniform float u_tilt;
uniform float u_dir;
varying vec2 v_uv;
varying float v_shade;
varying float v_face;
varying float v_lift;
void main() {
  vec2 p = a_pos.xy;
  float z = max(a_pos.z, 0.0);
  if (u_shadow > 0.5) {
    p.y += 8.0;
    p.x += 2.0;
  } else {
    float zc = min(z, u_focal * 0.42);
    float scale = u_focal / max(48.0, u_focal - zc);
    p.y -= z * u_lift;
    p.x += z * u_tilt * u_dir;
    p.x = u_hinge + (p.x - u_hinge) * scale;
  }
  vec2 q = p - u_origin;
  gl_Position = vec4(q.x / u_canvas.x * 2.0 - 1.0, 1.0 - q.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_uv = a_uv;
  v_shade = a_shade;
  v_face = a_face;
  v_lift = z;
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D u_front;
uniform sampler2D u_back;
uniform float u_shadow;
varying vec2 v_uv;
varying float v_shade;
varying float v_face;
varying float v_lift;
void main() {
  if (u_shadow > 0.5) {
    float a = clamp(v_lift / 90.0, 0.0, 1.0) * 0.28;
    gl_FragColor = vec4(0.05, 0.04, 0.03, a);
    return;
  }
  vec2 uv = v_uv;
  vec4 tex = texture2D(u_front, uv);
  if (v_face > 0.5) {
    uv.x = 1.0 - uv.x;
    tex = texture2D(u_back, uv);
  }
  float lit = clamp(v_shade, 0.86, 1.0);
  gl_FragColor = vec4(tex.rgb * lit, tex.a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Нет шейдера");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Шейдер не собрался");
  }
  return shader;
}

export class CurlRenderer {
  readonly gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private bufPos: WebGLBuffer;
  private bufUv: WebGLBuffer;
  private bufShade: WebGLBuffer;
  private bufFace: WebGLBuffer;
  private bufIndex: WebGLBuffer;
  private front: WebGLTexture;
  private back: WebGLTexture;
  private canvasCss = [1, 1];
  private origin = [0, 0];

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) throw new Error("WebGL недоступен");
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!program) throw new Error("Нет программы");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Программа не связалась");
    }
    this.program = program;
    this.bufPos = buffer(gl);
    this.bufUv = buffer(gl);
    this.bufShade = buffer(gl);
    this.bufFace = buffer(gl);
    this.bufIndex = buffer(gl);
    this.front = texture(gl);
    this.back = texture(gl);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(cssW: number, cssH: number, originX: number, originY: number, dpr: number): void {
    const gl = this.gl;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.canvasCss = [Math.max(1, cssW), Math.max(1, cssH)];
    this.origin = [originX, originY];
    gl.viewport(0, 0, w, h);
  }

  setFront(source: TexImageSource): void {
    upload(this.gl, this.front, source);
  }

  setBack(source: TexImageSource): void {
    upload(this.gl, this.back, source);
  }

  clear(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  draw(mesh: Mesh, proj: { hingeX: number; lift: number; focal: number; tilt: number; dir: number }): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    const loc = (name: string) => gl.getAttribLocation(this.program, name);
    bindAttrib(gl, this.bufPos, loc("a_pos"), 3, mesh.pos);
    bindAttrib(gl, this.bufUv, loc("a_uv"), 2, mesh.uv);
    bindAttrib(gl, this.bufShade, loc("a_shade"), 1, mesh.shade);
    bindAttrib(gl, this.bufFace, loc("a_face"), 1, mesh.face);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIndex);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.DYNAMIC_DRAW);
    gl.uniform2f(gl.getUniformLocation(this.program, "u_canvas"), this.canvasCss[0], this.canvasCss[1]);
    gl.uniform2f(gl.getUniformLocation(this.program, "u_origin"), this.origin[0], this.origin[1]);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_hinge"), proj.hingeX);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_lift"), proj.lift);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_focal"), Math.max(80, proj.focal));
    gl.uniform1f(gl.getUniformLocation(this.program, "u_tilt"), proj.tilt);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_dir"), proj.dir);
    const uShadow = gl.getUniformLocation(this.program, "u_shadow");
    gl.uniform1i(gl.getUniformLocation(this.program, "u_front"), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_back"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.front);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.back);
    gl.uniform1f(uShadow, 1);
    gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);
    gl.uniform1f(uShadow, 0);
    gl.drawElements(gl.TRIANGLES, mesh.index.length, gl.UNSIGNED_SHORT, 0);
  }
}

function buffer(gl: WebGLRenderingContext): WebGLBuffer {
  const buf = gl.createBuffer();
  if (!buf) throw new Error("Нет буфера");
  return buf;
}

function texture(gl: WebGLRenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Нет текстуры");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function upload(gl: WebGLRenderingContext, tex: WebGLTexture, source: TexImageSource): void {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}

function bindAttrib(
  gl: WebGLRenderingContext,
  buf: WebGLBuffer,
  loc: number,
  size: number,
  data: Float32Array,
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}
