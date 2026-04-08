const imageInput = document.getElementById('imageInput');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const thresholdInput = document.getElementById('thresholdInput');
const thresholdValue = document.getElementById('thresholdValue');
const invertInput = document.getElementById('invertInput');
const autoThresholdBtn = document.getElementById('autoThresholdBtn');
const variableNameInput = document.getElementById('variableNameInput');
const bytesPerLineInput = document.getElementById('bytesPerLineInput');
const bitmapOutput = document.getElementById('bitmapOutput');
const copyBitmapBtn = document.getElementById('copyBitmapBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetAllBtn = document.getElementById('resetAllBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const zoomInput = document.getElementById('zoomInput');
const zoomValue = document.getElementById('zoomValue');
const originalPreview = document.getElementById('originalPreview');
const editorCanvas = document.getElementById('editorCanvas');
const editorCtx = editorCanvas.getContext('2d');
const hiddenWorkCanvas = document.getElementById('hiddenWorkCanvas');
const hiddenWorkCtx = hiddenWorkCanvas.getContext('2d', { willReadFrequently: true });
const originalMeta = document.getElementById('originalMeta');
const editorMeta = document.getElementById('editorMeta');

const state = {
  image: null,
  imageName: 'bitmap',
  zoom: Number(zoomInput.value),
  bitmap: createBitmap(64, 64),
  undoStack: [],
  redoStack: [],
  dragVisited: new Set(),
  dragging: false,
};

function createBitmap(width, height, fill = 0) {
  return {
    width,
    height,
    pixels: Array.from({ length: height }, () => Array.from({ length: width }, () => fill)),
  };
}

function cloneBitmap(bitmap) {
  return {
    width: bitmap.width,
    height: bitmap.height,
    pixels: bitmap.pixels.map((row) => [...row]),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeVariableName(name) {
  const cleaned = String(name || 'bitmap')
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z_]+/, '');
  return cleaned || 'bitmap';
}

function syncSizeInputsToBitmap() {
  widthInput.value = state.bitmap.width;
  heightInput.value = state.bitmap.height;
}

function pushHistory() {
  state.undoStack.push(cloneBitmap(state.bitmap));
  if (state.undoStack.length > 100) state.undoStack.shift();
  state.redoStack = [];
}

function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(cloneBitmap(state.bitmap));
  state.bitmap = state.undoStack.pop();
  syncSizeInputsToBitmap();
  updateAllOutputs();
}

function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(cloneBitmap(state.bitmap));
  state.bitmap = state.redoStack.pop();
  syncSizeInputsToBitmap();
  updateAllOutputs();
}

function resizeBitmapNearest(bitmap, width, height) {
  const next = createBitmap(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(bitmap.height - 1, Math.floor((y / height) * bitmap.height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(bitmap.width - 1, Math.floor((x / width) * bitmap.width));
      next.pixels[y][x] = bitmap.pixels[sourceY][sourceX];
    }
  }
  return next;
}

function getTargetSize() {
  const width = clamp(parseInt(widthInput.value, 10) || 64, 1, 512);
  const height = clamp(parseInt(heightInput.value, 10) || 64, 1, 512);
  widthInput.value = width;
  heightInput.value = height;
  return { width, height };
}

function updateDimensionsFromInputs() {
  const { width, height } = getTargetSize();
  if (state.bitmap.width !== width || state.bitmap.height !== height) {
    pushHistory();
    state.bitmap = resizeBitmapNearest(state.bitmap, width, height);
    updateAllOutputs();
  }
}

function handleImageUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageName = sanitizeVariableName(file.name);
      if (variableNameInput.value === 'bitmap' || !variableNameInput.value.trim()) {
        variableNameInput.value = state.imageName;
      }
      originalPreview.src = img.src;
      originalPreview.style.display = 'block';
      originalMeta.textContent = `${img.width} × ${img.height}`;
      generateFromCurrentImage(true);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function imageDataToBitmap(imageData, width, height, options) {
  const { threshold, invert } = options;
  const bitmap = createBitmap(width, height, 0);
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3] / 255;
      const compositeR = 255 * (1 - a) + r * a;
      const compositeG = 255 * (1 - a) + g * a;
      const compositeB = 255 * (1 - a) + b * a;
      const gray = 0.299 * compositeR + 0.587 * compositeG + 0.114 * compositeB;
      const black = invert ? gray >= threshold : gray < threshold;
      bitmap.pixels[y][x] = black ? 1 : 0;
    }
  }

  return bitmap;
}

function generateFromCurrentImage(saveHistory = false) {
  const { width, height } = getTargetSize();

  if (!state.image) {
    if (state.bitmap.width !== width || state.bitmap.height !== height) {
      if (saveHistory) pushHistory();
      state.bitmap = createBitmap(width, height, 0);
      updateAllOutputs();
    }
    return;
  }

  if (saveHistory) pushHistory();

  hiddenWorkCanvas.width = width;
  hiddenWorkCanvas.height = height;
  hiddenWorkCtx.clearRect(0, 0, width, height);
  hiddenWorkCtx.fillStyle = '#ffffff';
  hiddenWorkCtx.fillRect(0, 0, width, height);
  hiddenWorkCtx.imageSmoothingEnabled = true;
  hiddenWorkCtx.drawImage(state.image, 0, 0, width, height);

  const imageData = hiddenWorkCtx.getImageData(0, 0, width, height);
  state.bitmap = imageDataToBitmap(imageData, width, height, {
    threshold: Number(thresholdInput.value),
    invert: invertInput.checked,
  });
  updateAllOutputs();
}

function drawEditor() {
  const { width, height, pixels } = state.bitmap;
  const zoom = state.zoom;
  editorCanvas.width = width * zoom;
  editorCanvas.height = height * zoom;
  editorCtx.imageSmoothingEnabled = false;
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      editorCtx.fillStyle = pixels[y][x] ? '#000000' : '#ffffff';
      editorCtx.fillRect(x * zoom, y * zoom, zoom, zoom);
    }
  }

  editorCtx.strokeStyle = 'rgba(125, 140, 155, 0.45)';
  editorCtx.lineWidth = 1;
  for (let x = 0; x <= width; x += 1) {
    editorCtx.beginPath();
    editorCtx.moveTo(x * zoom + 0.5, 0);
    editorCtx.lineTo(x * zoom + 0.5, editorCanvas.height);
    editorCtx.stroke();
  }
  for (let y = 0; y <= height; y += 1) {
    editorCtx.beginPath();
    editorCtx.moveTo(0, y * zoom + 0.5);
    editorCtx.lineTo(editorCanvas.width, y * zoom + 0.5);
    editorCtx.stroke();
  }
}

function getPixelFromEvent(event) {
  const rect = editorCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * (editorCanvas.width / rect.width) / state.zoom);
  const y = Math.floor((event.clientY - rect.top) * (editorCanvas.height / rect.height) / state.zoom);
  if (x < 0 || y < 0 || x >= state.bitmap.width || y >= state.bitmap.height) return null;
  return { x, y };
}

function togglePixel(x, y) {
  state.bitmap.pixels[y][x] = state.bitmap.pixels[y][x] ? 0 : 1;
}

function handleEditorToggle(event) {
  const pixel = getPixelFromEvent(event);
  if (!pixel) return;
  const key = `${pixel.x},${pixel.y}`;
  if (state.dragVisited.has(key)) return;
  state.dragVisited.add(key);
  togglePixel(pixel.x, pixel.y);
  drawEditor();
  updateStats();
  updateOutputText();
}

function shiftBitmap(dx, dy) {
  const next = createBitmap(state.bitmap.width, state.bitmap.height, 0);
  for (let y = 0; y < state.bitmap.height; y += 1) {
    for (let x = 0; x < state.bitmap.width; x += 1) {
      const sourceX = x - dx;
      const sourceY = y - dy;
      if (sourceX >= 0 && sourceY >= 0 && sourceX < state.bitmap.width && sourceY < state.bitmap.height) {
        next.pixels[y][x] = state.bitmap.pixels[sourceY][sourceX];
      }
    }
  }
  state.bitmap = next;
}

function updateStats() {
  const width = state.bitmap.width;
  const height = state.bitmap.height;
  editorMeta.textContent = `${width} × ${height} · click para alternar`;
}

function bitmapToByteArray(bitmap) {
  const bytes = [];
  let currentByte = 0;
  let bitIndex = 7;

  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (bitmap.pixels[y][x]) currentByte |= (1 << bitIndex);
      bitIndex -= 1;
      if (bitIndex < 0) {
        bytes.push(currentByte);
        currentByte = 0;
        bitIndex = 7;
      }
    }
  }

  if (bitIndex !== 7) bytes.push(currentByte);
  return bytes;
}

function formatBitmapOutput() {
  const variableName = sanitizeVariableName(variableNameInput.value);
  variableNameInput.value = variableName;
  const bytes = bitmapToByteArray(state.bitmap);
  const bytesPerLine = clamp(parseInt(bytesPerLineInput.value, 10) || 16, 4, 64);
  bytesPerLineInput.value = bytesPerLine;

  const formattedBytes = bytes.map((byte) => `0x${byte.toString(16).padStart(2, '0')}`);
  const lines = [];
  for (let i = 0; i < formattedBytes.length; i += bytesPerLine) {
    lines.push(`  ${formattedBytes.slice(i, i + bytesPerLine).join(', ')}`);
  }

  return [
    `#define ${variableName.toUpperCase()}_WIDTH ${state.bitmap.width}`,
    `#define ${variableName.toUpperCase()}_HEIGHT ${state.bitmap.height}`,
    `const unsigned char ${variableName}[] PROGMEM = {`,
    lines.join(',\n'),
    `};`,
  ].join('\n');
}

function bitmapToJson() {
  return JSON.stringify({
    width: state.bitmap.width,
    height: state.bitmap.height,
    pixels: state.bitmap.pixels,
  }, null, 2);
}

function updateOutputText() {
  bitmapOutput.value = formatBitmapOutput();
}

function updateAllOutputs(redrawEditor = true) {
  syncSizeInputsToBitmap();
  if (redrawEditor) drawEditor();
  updateStats();
  updateOutputText();
}

function autoThreshold() {
  if (!state.image) return;
  const { width, height } = getTargetSize();
  hiddenWorkCanvas.width = width;
  hiddenWorkCanvas.height = height;
  hiddenWorkCtx.clearRect(0, 0, width, height);
  hiddenWorkCtx.fillStyle = '#ffffff';
  hiddenWorkCtx.fillRect(0, 0, width, height);
  hiddenWorkCtx.imageSmoothingEnabled = true;
  hiddenWorkCtx.drawImage(state.image, 0, 0, width, height);

  const data = hiddenWorkCtx.getImageData(0, 0, width, height).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const average = Math.round(sum / (data.length / 4));
  thresholdInput.value = average;
  thresholdValue.textContent = average;
  generateFromCurrentImage(true);
}

function copyText(text, button, originalLabel) {
  navigator.clipboard.writeText(text)
    .then(() => {
      button.textContent = 'Copiado';
      setTimeout(() => {
        button.textContent = originalLabel;
      }, 1200);
    })
    .catch(() => {
      button.textContent = 'No se pudo copiar';
      setTimeout(() => {
        button.textContent = originalLabel;
      }, 1400);
    });
}

function downloadOutput() {
  const blob = new Blob([bitmapOutput.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const variableName = sanitizeVariableName(variableNameInput.value);
  link.href = url;
  link.download = `${variableName}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetAll() {
  state.image = null;
  state.imageName = 'bitmap';
  state.zoom = 12;
  state.bitmap = createBitmap(64, 64, 0);
  state.undoStack = [];
  state.redoStack = [];
  state.dragVisited = new Set();
  state.dragging = false;

  imageInput.value = '';
  widthInput.value = 64;
  heightInput.value = 64;
  thresholdInput.value = 128;
  thresholdValue.textContent = '128';
  invertInput.checked = false;
  variableNameInput.value = 'bitmap';
  bytesPerLineInput.value = 16;
  zoomInput.value = 12;
  zoomValue.textContent = '12x';
  originalPreview.removeAttribute('src');
  originalPreview.style.display = 'none';
  originalMeta.textContent = 'Sin imagen';
  updateAllOutputs();
}

imageInput.addEventListener('change', (event) => handleImageUpload(event.target.files?.[0]));
thresholdInput.addEventListener('input', () => {
  thresholdValue.textContent = thresholdInput.value;
  generateFromCurrentImage(true);
});
invertInput.addEventListener('change', () => generateFromCurrentImage(true));
autoThresholdBtn.addEventListener('click', autoThreshold);
widthInput.addEventListener('change', () => {
  if (state.image) generateFromCurrentImage(true);
  else updateDimensionsFromInputs();
});
heightInput.addEventListener('change', () => {
  if (state.image) generateFromCurrentImage(true);
  else updateDimensionsFromInputs();
});
zoomInput.addEventListener('input', () => {
  state.zoom = Number(zoomInput.value);
  zoomValue.textContent = `${state.zoom}x`;
  drawEditor();
});
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
bytesPerLineInput.addEventListener('change', updateOutputText);
variableNameInput.addEventListener('input', updateOutputText);
copyBitmapBtn.addEventListener('click', () => copyText(bitmapOutput.value, copyBitmapBtn, 'Copiar bitmap'));
downloadBtn.addEventListener('click', downloadOutput);
resetAllBtn.addEventListener('click', resetAll);

editorCanvas.addEventListener('mousedown', (event) => {
  pushHistory();
  state.dragging = true;
  state.dragVisited = new Set();
  handleEditorToggle(event);
});

window.addEventListener('mousemove', (event) => {
  if (!state.dragging) return;
  handleEditorToggle(event);
});

window.addEventListener('mouseup', () => {
  state.dragging = false;
  state.dragVisited = new Set();
});

window.addEventListener('keydown', (event) => {
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  if (ctrlOrMeta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
    return;
  }
  if (ctrlOrMeta && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
    event.preventDefault();
    redo();
    return;
  }

  if (!event.shiftKey) return;

  const moves = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };

  if (moves[event.key]) {
    event.preventDefault();
    pushHistory();
    const [dx, dy] = moves[event.key];
    shiftBitmap(dx, dy);
    updateAllOutputs();
  }
});

resetAll();
