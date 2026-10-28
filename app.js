(() => {
  const $ = (id) => document.getElementById(id);
  const input = $("videoInput");
  const video = $("videoPreview");
  const dropzone = $("dropzone");
  const fileLabel = $("fileLabel");
  const fileMeta = $("fileMeta");
  const convertBtn = $("convertBtn");
  const message = $("message");
  const progressWrap = $("progressWrap");
  const progress = $("progress");
  const percent = $("percent");
  const status = $("status");
  const resultPanel = $("resultPanel");
  const gifResult = $("gifResult");
  const downloadBtn = $("downloadBtn");
  const ffmpegGlobal = window.FFmpegWASM;
  const utilGlobal = window.FFmpegUtil;

  let selectedFile = null;
  let ffmpeg = null;
  let ffmpegReady = false;
  let videoUrl = null;
  let resultUrl = null;
  let converting = false;

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  const maxBytes = () => {
    const n = Number($("maxSize").value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n * ($("sizeUnit").value === "MB" ? 1024 * 1024 : 1024);
  };
  const setMessage = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error", error);
  };
  const setProgress = (value, text) => {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    progress.value = v;
    percent.textContent = `${v}%`;
    if (text) status.textContent = text;
  };
  const safeNum = (id, fallback) => {
    const n = Number($(id).value);
    return Number.isFinite(n) ? n : fallback;
  };

  $("width").addEventListener("input", () => $("widthOut").textContent = `${$("width").value} px`);
  $("fps").addEventListener("input", () => $("fpsOut").textContent = `${$("fps").value} FPS`);

  function selectFile(file) {
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|m4v|mpeg|mpg)$/i.test(file.name)) {
      setMessage("Elegí un archivo de video compatible.", true);
      return;
    }
    selectedFile = file;
    fileLabel.textContent = file.name;
    fileMeta.textContent = `${formatBytes(file.size)} · ${file.type || "video"}`;
    fileMeta.hidden = false;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;
    video.hidden = false;
    convertBtn.disabled = false;
    resultPanel.hidden = true;
    setMessage("Video listo. Configurá el recorte y el peso máximo.");
  }

  input.addEventListener("change", () => selectFile(input.files && input.files[0]));
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault(); dropzone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, e => {
    e.preventDefault(); dropzone.classList.remove("dragging");
  }));
  dropzone.addEventListener("drop", e => selectFile(e.dataTransfer && e.dataTransfer.files[0]));

  async function loadFFmpeg() {
    if (ffmpegReady) return;
    if (!ffmpegGlobal || !utilGlobal) {
      throw new Error("No se pudieron cargar las librerías de conversión. Revisá tu conexión y recargá la página.");
    }
    setProgress(2, "Cargando motor de conversión…");
    progressWrap.hidden = false;
    const { FFmpeg } = ffmpegGlobal;
    const { toBlobURL } = utilGlobal;
    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress: p }) => {
      if (Number.isFinite(p)) setProgress(Math.max(4, p * 70), "Procesando video…");
    });
    ffmpeg.on("log", ({ message: line }) => {
      if (line && /error/i.test(line) && /memory|alloc|failed/i.test(line)) {
        setMessage("El móvil puede haberse quedado sin memoria. Probá un video más corto o liviano.", true);
      }
    });
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm");
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegReady = true;
  }

  async function convertOnce({ inputName, outputName, start, duration, width, fps, colors }) {
    const paletteName = `palette_${Math.random().toString(36).slice(2)}.png`;
    const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;
    const common = ["-ss", String(start), "-t", String(duration), "-i", inputName];
    await ffmpeg.exec([...common, "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=max_colors=${colors}`, paletteName]);
    await ffmpeg.exec(["-ss", String(start), "-t", String(duration), "-i", inputName, "-i", paletteName,
      "-lavfi", `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
      "-loop", "0", outputName]);
    const data = await ffmpeg.readFile(outputName);
    try { await ffmpeg.deleteFile(paletteName); } catch (_) {}
    try { await ffmpeg.deleteFile(outputName); } catch (_) {}
    return data;
  }

  convertBtn.addEventListener("click", async () => {
    if (!selectedFile || converting) return;
    const limit = maxBytes();
    if (!limit) { setMessage("Ingresá un límite de peso mayor que cero.", true); return; }
    const start = Math.max(0, safeNum("start", 0));
    const duration = Math.max(0.5, safeNum("duration", 5));
    const videoDuration = Number.isFinite(video.duration) ? video.duration : Infinity;
    if (start >= videoDuration) { setMessage("El inicio está después del final del video.", true); return; }
    const actualDuration = Math.min(duration, videoDuration - start);
    if (actualDuration <= 0) { setMessage("La duración del recorte no es válida.", true); return; }

    converting = true;
    convertBtn.disabled = true;
    progressWrap.hidden = false;
    resultPanel.hidden = true;
    setMessage("Preparando…");
    setProgress(0, "Preparando conversión…");
    let inputName = "source_video.mp4";
    try {
      await loadFFmpeg();
      await ffmpeg.writeFile(inputName, await utilGlobal.fetchFile(selectedFile));
      const baseWidth = Number($("width").value);
      const baseFps = Number($("fps").value);
      const attempts = [];
      // Try best quality first, then lower FPS/width/color count until the cap is met.
      for (const scaleFactor of [1, 0.85, 0.7, 0.55, 0.4]) {
        for (const fpsFactor of [1, 0.8, 0.6, 0.45]) {
          for (const colors of [128, 96, 64, 48, 32, 16]) {
            const width = Math.max(120, Math.round((baseWidth * scaleFactor) / 2) * 2);
            const fps = Math.max(4, Math.round(baseFps * fpsFactor));
            const outputName = `result_${attempts.length}.gif`;
            const total = 5 * 4 * 6;
            setProgress(8 + (attempts.length / total) * 88, `Probando calidad ${attempts.length + 1}…`);
            const data = await convertOnce({ inputName, outputName, start, duration: actualDuration, width, fps, colors });
            const bytes = data.byteLength;
            attempts.push({ data, bytes, width, fps, colors });
            if (bytes <= limit) {
              const blob = new Blob([data], { type: "image/gif" });
              if (resultUrl) URL.revokeObjectURL(resultUrl);
              resultUrl = URL.createObjectURL(blob);
              gifResult.src = resultUrl;
              downloadBtn.href = resultUrl;
              downloadBtn.download = `${selectedFile.name.replace(/\.[^.]+$/, "") || "convertido"}.gif`;
              $("resultSize").textContent = formatBytes(bytes);
              $("resultLimit").textContent = formatBytes(limit);
              $("resultNote").textContent = `Configuración final: ${width} px · ${fps} FPS · ${colors} colores.`;
              resultPanel.hidden = false;
              setProgress(100, "Conversión terminada");
              setMessage("Listo. El GIF respeta el límite que elegiste.");
              try { await ffmpeg.deleteFile(inputName); } catch (_) {}
              return;
            }
          }
        }
      }
      const smallest = attempts[attempts.length - 1];
      const blob = new Blob([smallest.data], { type: "image/gif" });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(blob);
      gifResult.src = resultUrl;
      downloadBtn.href = resultUrl;
      downloadBtn.download = `${selectedFile.name.replace(/\.[^.]+$/, "") || "convertido"}.gif`;
      $("resultSize").textContent = formatBytes(smallest.bytes);
      $("resultLimit").textContent = formatBytes(limit);
      $("resultNote").textContent = "No se alcanzó el límite incluso con la configuración más liviana. Este es el GIF más pequeño de los intentos; probá reducir la duración.";
      resultPanel.hidden = false;
      setProgress(100, "Conversión terminada");
      setMessage("El archivo final supera el límite solicitado.", true);
      try { await ffmpeg.deleteFile(inputName); } catch (_) {}
    } catch (err) {
      console.error(err);
      setMessage(`No se pudo convertir el video. ${err && err.message ? err.message : "Probá con un video más corto."}`, true);
      setProgress(0, "Conversión interrumpida");
    } finally {
      converting = false;
      convertBtn.disabled = !selectedFile;
    }
  });
})();
