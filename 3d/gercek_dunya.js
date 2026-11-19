/* gercek_dunya.js — index7.html 3D dünyası için gerçekçilik katmanı (three.js r128).
   İçerik üretmez; yalnız ışık/gök/atmosfer/son işlem kodudur:
   - fiziksel gök (THREE.Sky) + saatle uyumlu güneş, gece koyu lacivert-siyah; ufuk sis rengine erir
   - sis rengi gökten ÖLÇÜLÜR (ufkun 3° üstü), yansıma ortamı gökten üretilir (PMREM)
   - masaüstü: tek sahne çizimi (MSAA) + derinlikten ortam kapanması (AO) + hafif renk/vinyet/gren
   - zemin (uydu) yakın ayrıntı gürültüsü, gece sokak lambası ışık havuzları (ışık haritası)
   Telefon (dokunmatik): son işlem yok, gök/ışık/malzeme var. */
(function () {
  'use strict';
  const T = window.THREE; if (!T) return;
  const G = window.GERCEK = { surum: 3 };
  // canlı ayar (konsoldan denenebilir): AO gücü/yarıçapları (m), vinyet, gren, doygunluk, kontrast, gök parlaklığı
  G.A = { ao: 1, aoR1: 1.1, aoR2: 5.5, aoK1: 1.0, aoK2: .55, vin: .16, gren: .02, doy: .93, kont: .14, gokPar: .54 };
  const siyah = () => { const t = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t };
  // gece sokak lambası ışık haritası (tepeden, ±uLambaR m) — zemin ve çevre binaları buradan aydınlanır
  G.LU = { tLamba: { value: siyah() }, uLambaR: { value: 520 }, uLambaG: { value: 0 }, uLambaRenk: { value: new T.Color(1, .62, .3) }, uAyr: { value: .45 } };

  const GURULTU = `
    float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }
    float zeminAyr(vec2 w){ float px = sqrt(length(dFdx(w)) * length(dFdy(w)));   // yatık bakışta da (yaya) ayrıntı kalsın
      float k1 = 1.0 - smoothstep(0.03, 0.22, px), k2 = 1.0 - smoothstep(0.25, 1.4, px);
      return (gn(w * 31.0) - 0.5) * 0.5 * k1 + (gn(w * 7.3 + 11.0) - 0.5) * 0.6 * k1 + (gn(w * 0.8 + 3.0) - 0.5) * 0.35 * k2; }`;
  const LAMBA_PARS = 'uniform sampler2D tLamba; uniform float uLambaR, uLambaG, uAyr; uniform vec3 uLambaRenk;\n' +
    'float lambaIsik(vec2 w){ vec2 u = w / (2.0 * uLambaR) + 0.5; return (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0) ? 0.0 : texture2D(tLamba, u).r; }\n';

  /* zemin malzemesi (uydu MeshBasic ya da site zemini MeshStandard): yakında ayrıntı gürültüsü + gece lamba ışığı */
  G.zeminEkle = function (m, lamba) {
    const once = m.onBeforeCompile, onceA = m.customProgramCacheKey;
    m.extensions = Object.assign(m.extensions || {}, { derivatives: true });
    m.onBeforeCompile = (sh, r) => {
      if (once) once(sh, r);
      Object.assign(sh.uniforms, G.LU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;\n' + LAMBA_PARS + GURULTU)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          '{ diffuseColor.rgb *= 1.0 + zeminAyr(vGW.xz) * uAyr;\n' +
          (lamba ? '#ifdef USE_MAP\n diffuseColor.rgb += texelColor.rgb * (1.0 + zeminAyr(vGW.xz) * uAyr) * uLambaRenk * (lambaIsik(vGW.xz) * uLambaG);\n#endif\n' : '') + '}');
    };
    m.customProgramCacheKey = () => (onceA ? onceA.call(m) : '') + '-gzemin' + (lamba ? 'L' : '');
    m.needsUpdate = true;
  };
  G.LAMBA_PARS = LAMBA_PARS;

  /* sokak lambaları: tepeden ışık haritası (zemin/cephe aydınlanması) + armatür parıltısı */
  G.lambaKur = function (Lm, grup) {
    const R = G.LU.uLambaR.value, N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.globalCompositeOperation = 'lighter';
    const pos = [];
    for (const q of Lm) {
      const hx = q[0] + Math.cos(q[2]) * 1.55, hz = q[1] - Math.sin(q[2]) * 1.55;   // armatürün yere izdüşümü
      const u = (hx + R) / (2 * R) * N, v = (hz + R) / (2 * R) * N, r = 15 / (2 * R) * N;
      const g = x.createRadialGradient(u, v, 0, u, v, r);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.18, 'rgba(255,255,255,.62)'); g.addColorStop(.45, 'rgba(255,255,255,.2)'); g.addColorStop(.75, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(u - r, v - r, 2 * r, 2 * r);
      pos.push(hx, 7.25, hz);
    }
    const t = new T.CanvasTexture(c); t.flipY = false; t.minFilter = T.LinearFilter; t.generateMipmaps = false; G.LU.tLamba.value = t;
    // parıltı: her armatürde küçük, sıcak, kameraya dönük ışık lekesi (yalnız gece)
    const pc = document.createElement('canvas'); pc.width = pc.height = 64; const px = pc.getContext('2d'), pg = px.createRadialGradient(32, 32, 0, 32, 32, 32);
    pg.addColorStop(0, 'rgba(255,255,255,1)'); pg.addColorStop(.12, 'rgba(255,240,215,.85)'); pg.addColorStop(.35, 'rgba(255,200,140,.22)'); pg.addColorStop(1, 'rgba(255,180,110,0)');
    px.fillStyle = pg; px.fillRect(0, 0, 64, 64);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    const pm = new T.PointsMaterial({ map: new T.CanvasTexture(pc), color: 0xffd9a8, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: true });
    const nokta = new T.Points(geo, pm); nokta.frustumCulled = false; nokta.renderOrder = 6; nokta.visible = false; grup.add(nokta);
    return { doku: t, nokta };
  };

  /* ---------- gök ---------- */
  function gokKur(R) {
    if (!T.Sky) return null;
    const sky = new T.Sky(), m = sky.material, f0 = m.fragmentShader;
    const f = f0.replace('const vec3 cameraPos = vec3( 0.0, 0.0, 0.0 );', 'uniform float uPar, uTavan, uGeceK, uSisK; uniform vec3 uGeceUst, uGeceAlt, uSis;')
      .replace('vWorldPosition - cameraPos', 'vWorldPosition - cameraPosition')
      .replace('gl_FragColor = vec4( retColor, 1.0 );',
        'float hY = direction.y;\n vec3 geceR = mix(uGeceAlt, uGeceUst, pow(clamp(hY, 0.0, 1.0), 0.42));\n' +
        ' gl_FragColor = vec4(mix(min(retColor * uPar, vec3(uTavan)), geceR, uGeceK), 1.0);')
      .replace('#include <encodings_fragment>', '#include <encodings_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, uSis, uSisK * (1.0 - smoothstep(-0.012, 0.085, hY)));');
    if (f === f0 || f.indexOf('uSisK * (1.0') < 0 || f.indexOf('geceR') < 0) return null;
    m.fragmentShader = f; m.fog = false;
    Object.assign(m.uniforms, { uPar: { value: 1 }, uTavan: { value: 1e5 }, uGeceK: { value: 0 }, uSisK: { value: 1 }, uSis: { value: new T.Color(1, 1, 1) },
      uGeceUst: { value: new T.Color(.0016, .0021, .0034) }, uGeceAlt: { value: new T.Color(.0085, .0082, .009) }, hk: { value: 0 } });
    const izle = o => { o.frustumCulled = false; o.scale.setScalar(1000); o.onBeforeRender = (r, s, cam) => { o.position.setFromMatrixPosition(cam.matrixWorld); o.updateMatrix(); o.matrixWorld.copy(o.matrix) } };
    izle(sky); sky.renderOrder = -1;
    // gökten ölçüm ve yansıma ortamı için ayrı küçük sahne
    const sah = new T.Scene(), sky2 = new T.Mesh(sky.geometry, m); izle(sky2); sah.add(sky2);
    const yerE = new T.Mesh(new T.CircleGeometry(90, 24), new T.MeshBasicMaterial({ color: 0x555555, toneMapped: false, fog: false }));
    yerE.rotation.x = -Math.PI / 2; yerE.position.y = -1.5; sah.add(yerE);
    const rtK = new T.WebGLRenderTarget(8, 8, { depthBuffer: false }); rtK.texture.encoding = T.sRGBEncoding;
    const kamK = new T.PerspectiveCamera(5, 1, .1, 10), buf = new Uint8Array(8 * 8 * 4);
    const pmrem = new T.PMREMGenerator(R);
    return { sky, m, sah, yerE, rtK, kamK, buf, pmrem };
  }

  /* ---------- son işlem: MSAA sahne + derinlikten AO + renk ---------- */
  const TEPE = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const DER = `uniform sampler2D tDer; uniform mat4 uP, uPT; uniform vec2 uPx, uYU;
    vec3 konum(vec2 uv){ float d = textureLod(tDer, uv, 0.0).x; vec4 c = uPT * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return c.xyz / c.w; }
    float zl(vec2 uv){ float d = textureLod(tDer, uv, 0.0).x; return uYU.x * uYU.y / (uYU.y - d * (uYU.y - uYU.x)); }`;
  const AO_F = `varying vec2 vUv; uniform float uR1, uR2, uK1, uK2; ${DER}
    float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    float halka(vec3 p, vec3 n, float R, float a0){
      vec2 r = R * 0.5 * vec2(uP[0][0], uP[1][1]) / -p.z;
      if (r.y < 2.5 * uPx.y) return 1.0;
      float kis = min(1.0, 0.11 / r.y); r *= kis;
      float s = 0.0, R2 = R * R;
      for (int i = 0; i < 11; i++) {
        float fi = float(i), a = a0 + fi * 2.39996, rr = sqrt((fi + 0.5) / 11.0);
        vec3 v = konum(vUv + rr * r * vec2(cos(a), sin(a))) - p;
        float dd = dot(v, v), vn = dot(v, n) - (0.05 + 0.004 * -p.z), f = max(R2 - dd, 0.0);
        s += f * f * f * max(vn / (dd + 0.02), 0.0);
      }
      float ao = max(0.0, 1.0 - s * 5.0 * R / (R2 * R2 * R2) / 11.0);
      return mix(1.0, ao, smoothstep(2.5, 6.0, r.y / uPx.y / kis));
    }
    void main(){
      if (texture2D(tDer, vUv).x >= 0.999999) { gl_FragColor = vec4(1.0); return; }
      vec3 p = konum(vUv), x1 = konum(vUv + vec2(uPx.x, 0.0)), x0 = konum(vUv - vec2(uPx.x, 0.0)), y1 = konum(vUv + vec2(0.0, uPx.y)), y0 = konum(vUv - vec2(0.0, uPx.y));
      vec3 dx = abs(x1.z - p.z) < abs(p.z - x0.z) ? x1 - p : p - x0, dy = abs(y1.z - p.z) < abs(p.z - y0.z) ? y1 - p : p - y0;
      vec3 n = normalize(cross(dx, dy));
      float a0 = ign(gl_FragCoord.xy) * 6.2832;
      float a1 = mix(1.0, halka(p, n, uR1, a0), uK1), a2 = mix(1.0, halka(p, n, uR2, a0 + 1.7), uK2);
      gl_FragColor = vec4(max(a1 * a2, 0.3), 0.0, 0.0, 1.0);
    }`;
  const BUL_F = `varying vec2 vUv; uniform sampler2D tAO; uniform vec2 uYon; ${DER}
    void main(){ float z0 = zl(vUv), t = 0.0, w = 0.0;
      for (int i = -4; i <= 4; i++) { vec2 u = vUv + uYon * float(i) * 1.5; float g = exp(-float(i * i) / 9.0) * max(0.0, 1.0 - abs(zl(u) - z0) / (0.03 * z0 + 0.2)) + 0.0001;
        t += textureLod(tAO, u, 0.0).r * g; w += g; }
      gl_FragColor = vec4(t / w, 0.0, 0.0, 1.0); }`;
  const SON_F = `varying vec2 vUv; uniform sampler2D tRenk, tAO; uniform float uAO, uSisY, uSisU, uVin, uGren, uDoy, uKont, uEn, uGoster; ${DER}
    float hs(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main(){
      vec3 c = texture2D(tRenk, vUv).rgb;
      float d = texture2D(tDer, vUv).x;
      if (uAO > 0.001 && d < 0.999999) {
        float ao = texture2D(tAO, vUv).r, z = zl(vUv);
        ao = mix(1.0, ao, uAO * (1.0 - smoothstep(uSisY, uSisY + (uSisU - uSisY) * 0.55, z)));
        // ekran (sRGB) uzayında: gölge hafif soğuk, tam siyaha inmez
        c *= mix(vec3(0.20, 0.22, 0.27), vec3(1.0), pow(ao, 0.8));
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uDoy);                                   // doygunluk: plastik renkleri doğal tona
      c = mix(c, c * c * (3.0 - 2.0 * c), uKont);                  // hafif film kontrastı
      c += vec3(-0.006, 0.0, 0.009) * (1.0 - l) + vec3(0.007, 0.003, -0.006) * l;   // gölge serin, ışık ılık (çok hafif)
      vec2 q = (vUv - 0.5) * vec2(min(uEn, 1.9) / 1.6, 1.0);
      c *= 1.0 - uVin * smoothstep(0.32, 1.0, length(q) * 1.25);   // vinyet
      float g = hs(gl_FragCoord.xy) + hs(gl_FragCoord.xy + 17.3) - 1.0;
      c += g * uGren * (0.55 + 0.45 * (1.0 - l));                  // film greni (sabit, hafif)
      if (uGoster > 0.5) c = vec3(texture2D(tAO, vUv).r);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;
  function postKur(R) {
    if (!R.capabilities.isWebGL2 || !T.WebGLMultisampleRenderTarget) return null;
    const qs = new T.Scene(), qc = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); geo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const dort = new T.Mesh(geo); dort.frustumCulled = false; qs.add(dort);
    const ort = { tDer: { value: null }, uP: { value: new T.Matrix4() }, uPT: { value: new T.Matrix4() }, uPx: { value: new T.Vector2() }, uYU: { value: new T.Vector2(1, 1000) } };
    const malz = (f, u) => new T.ShaderMaterial({ vertexShader: TEPE, fragmentShader: f, uniforms: Object.assign(u, ort), depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    const mAO = malz(AO_F, { uR1: { value: 1 }, uR2: { value: 5 }, uK1: { value: 1 }, uK2: { value: 1 } });
    const mBul = malz(BUL_F, { tAO: { value: null }, uYon: { value: new T.Vector2() } });
    const mSon = malz(SON_F, { tRenk: { value: null }, tAO: { value: null }, uAO: { value: 1 }, uSisY: { value: 250 }, uSisU: { value: 1500 }, uVin: { value: 0 }, uGren: { value: 0 }, uDoy: { value: 1 }, uKont: { value: 0 }, uEn: { value: 1.6 }, uGoster: { value: 0 } });
    let rtS = null, rtA = null, rtB = null, bozuk = false;
    const v2 = new T.Vector2();
    const P = { aoGuc: 1,
      boyut() {
        R.getDrawingBufferSize(v2); const w = Math.max(2, Math.round(v2.x)), h = Math.max(2, Math.round(v2.y));
        if (rtS && rtS.width === w && rtS.height === h) return;
        for (const r of [rtS, rtA, rtB]) if (r) { if (r.depthTexture) r.depthTexture.dispose(); r.dispose() }
        rtS = new T.WebGLMultisampleRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat });
        rtS.samples = 4; rtS.texture.encoding = T.sRGBEncoding; rtS.texture.generateMipmaps = false;
        rtS.depthTexture = new T.DepthTexture(w, h, T.UnsignedIntType); rtS.depthTexture.minFilter = rtS.depthTexture.magFilter = T.NearestFilter;
        const yap = () => { const r = new T.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: false }); r.texture.generateMipmaps = false; return r };
        rtA = yap(); rtB = yap();
        ort.uPx.value.set(1 / w, 1 / h); ort.tDer.value = rtS.depthTexture;
      },
      ciz(sahne, kam) {
        if (bozuk) { R.setRenderTarget(null); R.render(sahne, kam); return }
        this.boyut();
        const A = G.A, eski = R.getRenderTarget();
        R.setRenderTarget(rtS); R.render(sahne, kam);
        ort.uP.value.copy(kam.projectionMatrix); ort.uPT.value.copy(kam.projectionMatrixInverse); ort.uYU.value.set(kam.near, kam.far);
        const ao = A.ao * this.aoGuc;
        if (ao > .001) {
          mAO.uniforms.uR1.value = A.aoR1; mAO.uniforms.uR2.value = A.aoR2; mAO.uniforms.uK1.value = A.aoK1; mAO.uniforms.uK2.value = A.aoK2;
          dort.material = mAO; R.setRenderTarget(rtA); R.render(qs, qc);
          dort.material = mBul; mBul.uniforms.tAO.value = rtA.texture; mBul.uniforms.uYon.value.set(1 / rtA.width, 0); R.setRenderTarget(rtB); R.render(qs, qc);
          mBul.uniforms.tAO.value = rtB.texture; mBul.uniforms.uYon.value.set(0, 1 / rtA.height); R.setRenderTarget(rtA); R.render(qs, qc);
        }
        const u = mSon.uniforms, f = sahne.fog;
        u.tRenk.value = rtS.texture; u.tAO.value = rtA.texture; u.uAO.value = ao; if (f) { u.uSisY.value = f.near; u.uSisU.value = f.far }
        u.uVin.value = A.vin; u.uGren.value = A.gren; u.uDoy.value = A.doy; u.uKont.value = A.kont; u.uGoster.value = A.goster || 0; u.uEn.value = rtS.width / rtS.height;
        dort.material = mSon; R.setRenderTarget(eski); R.render(qs, qc);
        if (!this.denendi) { this.denendi = true; const gl = R.getContext(), h = gl.getError();
          if (h !== gl.NO_ERROR || gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { bozuk = true; console.warn('gerçekçilik: son işlem kapatıldı (GL ' + h + ')'); R.setRenderTarget(null); R.render(sahne, kam) } }
      } };
    return P;
  }

  /* ---------- kurulum ---------- */
  G.kur = function (R, secenek) {
    const o = secenek || {}, g = gokKur(R); if (!g) return null;
    const S = { gok: g.sky, sis: new T.Color(0xe6eef0), ortamRT: null, post: o.hafif ? null : postKur(R), hafif: !!o.hafif, anahtar: '', zaman: 0, yon: new T.Vector3(0, 1, 0) };
    const u = g.m.uniforms, gy = new T.Vector3();
    const olc = () => {   // sis rengi = göğün ufka yakın (3°) rengi, güneşe bakmayan üç yönün ortalaması (ekran uzayı)
      const eski = R.getRenderTarget(); g.yerE.visible = false; u.uSisK.value = 0;
      let r = 0, gg = 0, b = 0; const a0 = Math.atan2(S.yon.z, S.yon.x);
      for (const da of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const a = a0 + da; g.kamK.position.set(0, 0, 0); g.kamK.lookAt(Math.cos(a), Math.tan(3 * Math.PI / 180), Math.sin(a)); g.kamK.updateMatrixWorld();
        R.setRenderTarget(g.rtK); R.render(g.sah, g.kamK); R.readRenderTargetPixels(g.rtK, 0, 0, 8, 8, g.buf);
        for (let i = 0; i < 256; i += 4) { r += g.buf[i]; gg += g.buf[i + 1]; b += g.buf[i + 2] }
      }
      R.setRenderTarget(eski); u.uSisK.value = 1; const n = 3 * 64 * 255;
      S.sis.setRGB(r / n, gg / n, b / n); u.uSis.value.copy(S.sis);
    };
    const ortam = () => {   // yansıma/ortam ışığı: aynı gök + aydınlanmış zemin tonu
      const par = u.uPar.value; g.yerE.visible = true; u.uSisK.value = 0; u.uTavan.value = 16; u.uPar.value = S.gokPar;
      const rt = g.pmrem.fromScene(g.sah, 0, .1, 100);
      u.uSisK.value = 1; u.uTavan.value = 1e5; u.uPar.value = par;
      const eski = S.ortamRT; S.ortamRT = rt; if (o.ortamHazir) o.ortamHazir(rt.texture); if (eski) eski.dispose();
    };
    /* saat değişince: yon = gerçek güneş yönü (birim), alt = yükseklik (rad), P = palet, pozlama */
    S.ayarla = function (yon, alt, P) {
      S.yon.copy(yon);
      const gun = Math.min(1, Math.max(0, (alt + .11) / .11)), geceK = 1 - gun * gun * (3 - 2 * gun);   // -6°'de tam gece
      const alcak = 1 - Math.min(1, Math.max(0, alt / .45));                                              // alçak güneş: daha sıcak, puslu ufuk
      u.sunPosition.value.copy(yon).multiplyScalar(450000);
      u.turbidity.value = 3.4 + 3.2 * alcak; u.rayleigh.value = 1.6 + .9 * alcak; u.mieCoefficient.value = .0042; u.mieDirectionalG.value = .8;
      S.gokPar = G.A.gokPar * (1 - .25 * alcak * (1 - geceK));
      u.uPar.value = S.gokPar / Math.max(.2, P.pozlama); u.uGeceK.value = geceK;
      const yer = new T.Color(0x9a8f7c).convertSRGBToLinear().multiplyScalar((.1 + .95 * Math.max(0, Math.sin(alt))) * (1 - geceK) + .006);
      g.yerE.material.color.copy(yer);
      const anahtar = alt.toFixed(3) + '|' + P.pozlama.toFixed(3) + '|' + G.A.gokPar;
      if (anahtar === S.anahtar) return; S.anahtar = anahtar;
      olc();
      clearTimeout(S.zaman);
      if (!S.ortamRT) ortam(); else S.zaman = setTimeout(ortam, S.hafif ? 260 : 110);   // saat kaydırılırken her adımda yeniden üretme
    };
    return S;
  };
})();
