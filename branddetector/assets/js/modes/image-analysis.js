import { summarizeColors } from '../detectors/color-detector.js';
import { summarizeLogo } from '../detectors/logo-detector.js';
import { buildExports } from '../utils/export.js';
import { copyText, fileToDataUrl, loadImage } from '../utils/dom.js';
import { colorDistance, groupSimilarColors, parseColor, rgbaToHex, rgbToHsl } from '../utils/color.js';

function averageColor(pixels) {
  if (!pixels.length) return null;
  const total = pixels.reduce((acc, pixel) => {
    acc.r += pixel.r;
    acc.g += pixel.g;
    acc.b += pixel.b;
    return acc;
  }, { r: 0, g: 0, b: 0 });
  return {
    r: total.r / pixels.length,
    g: total.g / pixels.length,
    b: total.b / pixels.length,
    a: 1,
  };
}

function extractPaletteFromImage(image, maxSide = 180) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(24, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(24, Math.round(image.naturalHeight * scale));
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 16) {
    const a = data[i + 3];
    if (a < 170) continue;
    const r = Math.round(data[i] / 16) * 16;
    const g = Math.round(data[i + 1] / 16) * 16;
    const b = Math.round(data[i + 2] / 16) * 16;
    const hex = rgbaToHex({ r, g, b, a: 1 });
    buckets.set(hex, (buckets.get(hex) || 0) + 1);
  }

  const samples = [...buckets.entries()]
    .map(([hex, count]) => ({ value: hex, count, weight: count, role: 'image-palette', source: 'uploaded image' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);

  return { samples, width: canvas.width, height: canvas.height };
}

function inferImageColorRoles(samples) {
  const groups = groupSimilarColors(samples, 16);
  const sorted = groups.map((group) => ({
    ...group,
    hsl: rgbToHsl(parseColor(group.hex)),
  }));

  const backgroundCandidate = sorted.find((group) => group.hsl.s < 0.12 && group.hsl.l > 0.82)
    || sorted.find((group) => group.hsl.l > 0.82)
    || sorted[0];

  const accentCandidate = sorted.find((group) => group.hex !== backgroundCandidate?.hex && group.hsl.s > 0.35 && group.hsl.l > 0.18 && group.hsl.l < 0.84)
    || sorted.find((group) => group.hex !== backgroundCandidate?.hex)
    || null;

  const secondaryAccent = sorted.find((group) => group.hex !== backgroundCandidate?.hex && group.hex !== accentCandidate?.hex && group.hsl.s > 0.28) || null;
  const textCandidate = sorted.find((group) => group.hsl.s < 0.16 && group.hsl.l < 0.24) || null;

  const colorSamples = [];
  if (backgroundCandidate) colorSamples.push({ value: backgroundCandidate.hex, role: 'page-bg', source: 'image palette', weight: backgroundCandidate.weight });
  if (textCandidate) colorSamples.push({ value: textCandidate.hex, role: 'text', source: 'image palette', weight: textCandidate.weight });
  if (accentCandidate) colorSamples.push({ value: accentCandidate.hex, role: 'button-bg', source: 'image palette', weight: accentCandidate.weight });
  if (secondaryAccent) colorSamples.push({ value: secondaryAccent.hex, role: 'badge', source: 'image palette', weight: secondaryAccent.weight });

  colorSamples.push(...samples.slice(0, 16));
  return summarizeColors(colorSamples);
}

function suggestLogoCrop(image) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const previewWidth = 360;
  const scale = Math.min(1, previewWidth / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(80, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(80, Math.round(image.naturalHeight * scale));
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const region = {
    x: 0,
    y: 0,
    width: Math.round(canvas.width * 0.4),
    height: Math.round(canvas.height * 0.24),
  };
  const data = ctx.getImageData(region.x, region.y, region.width, region.height).data;

  const cornerPixels = [];
  const samplePoint = (x, y) => {
    const index = (y * region.width + x) * 4;
    cornerPixels.push({ r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] / 255 });
  };
  for (let i = 0; i < 12; i += 1) {
    samplePoint(Math.min(region.width - 1, i * 2), 0);
    samplePoint(0, Math.min(region.height - 1, i * 2));
    samplePoint(Math.max(0, region.width - 1 - i * 2), 0);
  }
  const background = averageColor(cornerPixels) || { r: 255, g: 255, b: 255, a: 1 };

  let minX = region.width;
  let minY = region.height;
  let maxX = 0;
  let maxY = 0;
  let found = 0;

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const index = (y * region.width + x) * 4;
      if (data[index + 3] < 140) continue;
      const current = { r: data[index], g: data[index + 1], b: data[index + 2], a: 1 };
      if (colorDistance(current, background) > 34) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        found += 1;
      }
    }
  }

  if (found < 100) {
    return {
      x: 0,
      y: 0,
      width: image.naturalWidth * 0.32,
      height: image.naturalHeight * 0.18,
      confidence: 'Low',
      notes: ['Suggested crop fell back to a top-left heuristic because no tight logo region was obvious.'],
    };
  }

  const pad = 10;
  const crop = {
    x: ((Math.max(0, minX - pad)) / canvas.width) * image.naturalWidth,
    y: ((Math.max(0, minY - pad)) / canvas.height) * image.naturalHeight,
    width: ((Math.min(region.width, maxX - minX + pad * 2)) / canvas.width) * image.naturalWidth,
    height: ((Math.min(region.height, maxY - minY + pad * 2)) / canvas.height) * image.naturalHeight,
    confidence: 'Low',
    notes: ['Suggested crop was inferred from top-left contrast against the surrounding background.'],
  };
  return crop;
}

function cropImageToDataUrl(image, crop) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL('image/png');
}

function renderImageWorkspace(container, session, setCrop, useCrop, chooseImage, copyHex) {
  const cropStyle = session.displayCrop
    ? `left:${session.displayCrop.x}px;top:${session.displayCrop.y}px;width:${session.displayCrop.width}px;height:${session.displayCrop.height}px;`
    : 'display:none;';

  container.classList.remove('is-empty');
  container.innerHTML = `
    <div class="preview-layout">
      <div class="preview-stage" id="previewStage">
        <img id="previewImage" src="${session.primary.dataUrl}" alt="Uploaded preview" />
        <div class="crop-box" id="cropBox" style="${cropStyle}"></div>
      </div>
      <aside class="preview-sidebar">
        <div class="card card--nested" style="padding: 0.9rem;">
          <h4>Files</h4>
          <div class="thumbnail-list">
            ${session.files
              .map((file, index) => `
                <button class="thumbnail-tile" type="button" data-file-index="${index}">
                  <img src="${file.dataUrl}" alt="${file.name}" />
                  <span>${file.name}</span>
                </button>
              `)
              .join('')}
          </div>
        </div>

        <div class="card card--nested" style="padding: 0.9rem;">
          <h4>Logo crop</h4>
          <p class="tiny-note">Drag on the preview to select a crop region. Suggested crop confidence is intentionally low.</p>
          <div class="action-row">
            <button class="small-btn" id="useSuggestedCropBtn" type="button">Use suggested crop</button>
            <button class="small-btn" id="useCurrentCropBtn" type="button">Use current crop</button>
          </div>
          ${session.croppedLogoUrl ? `<div class="logo-preview" style="margin-top:0.8rem;"><img src="${session.croppedLogoUrl}" alt="Logo crop" /></div>` : ''}
        </div>

        <div class="card card--nested" style="padding: 0.9rem;">
          <h4>Palette</h4>
          <div class="pill-row">
            ${session.palette.slice(0, 10).map((entry) => `<button class="small-btn" type="button" data-copy-hex="${entry.hex}">${entry.hex}</button>`).join('')}
          </div>
        </div>
      </aside>
    </div>
  `;

  container.querySelectorAll('[data-file-index]').forEach((button) => {
    button.addEventListener('click', () => chooseImage(Number(button.dataset.fileIndex)));
  });
  container.querySelectorAll('[data-copy-hex]').forEach((button) => {
    button.addEventListener('click', () => copyHex(button.dataset.copyHex));
  });
  container.querySelector('#useSuggestedCropBtn')?.addEventListener('click', () => useCrop(session.suggestedCrop));
  container.querySelector('#useCurrentCropBtn')?.addEventListener('click', () => {
    if (session.crop) useCrop(session.crop);
  });

  const stage = container.querySelector('#previewStage');
  const img = container.querySelector('#previewImage');
  let dragging = false;
  let start = null;

  const pointerToImageSpace = (event) => {
    const imgRect = img.getBoundingClientRect();
    const x = Math.max(0, Math.min(imgRect.width, event.clientX - imgRect.left));
    const y = Math.max(0, Math.min(imgRect.height, event.clientY - imgRect.top));
    return { x, y, imgRect };
  };

  const updateSelection = (event) => {
    if (!dragging || !start) return;
    const current = pointerToImageSpace(event);
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    setCrop({ x, y, width, height, imgRect: current.imgRect });
  };

  const handlePointerMove = (event) => updateSelection(event);
  const handlePointerUp = () => {
    dragging = false;
    start = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  stage.addEventListener('pointerdown', (event) => {
    if (event.target !== img) return;
    dragging = true;
    start = pointerToImageSpace(event);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  });
}

export function initImageMode({ onResult, onToast }) {
  const dropzone = document.getElementById('dropzone');
  const input = document.getElementById('imageInput');
  const previewArea = document.getElementById('imagePreviewArea');

  const session = {
    files: [],
    primaryIndex: 0,
    primary: null,
    primaryImage: null,
    palette: [],
    colors: null,
    crop: null,
    displayCrop: null,
    suggestedCrop: null,
    croppedLogoUrl: null,
    result: null,
  };

  const emit = () => {
    if (session.result) onResult(session.result);
  };

  const applyCropToResult = (crop, confidence = 'Low', source = 'manual crop') => {
    if (!session.primaryImage || !crop) return;
    session.croppedLogoUrl = cropImageToDataUrl(session.primaryImage, crop);
    const logo = summarizeLogo([
      {
        source,
        previewUrl: session.croppedLogoUrl,
        url: session.croppedLogoUrl,
        visible: true,
        inHomeLink: false,
        semanticScore: 0.2,
        isVector: false,
        topLeftScore: 0.04,
        sizeScore: 0.08,
        score: source === 'manual crop' ? 0.82 : 0.38,
        confidence,
        reasons: [source === 'manual crop' ? 'user-selected crop' : 'heuristic screenshot crop'],
      },
    ], [source === 'manual crop' ? 'Logo was selected manually from the screenshot.' : 'Logo crop is heuristic only.']);

    session.result = {
      mode: 'image',
      page: { url: '', title: session.primary?.name || 'Uploaded image' },
      logo,
      fonts: { heading: null, body: null, ui: null, nav: null, mono: null, samples: [] },
      colors: session.colors,
      brandSignals: {
        themeColor: null,
        favicon: null,
        ogImage: null,
        manifestIcons: [],
        schemaLogo: null,
        cssVariables: [],
        icons: [],
      },
      evidence: [
        {
          section: 'colors',
          label: 'Image palette extraction',
          source: 'uploaded image',
          confidence: 'Medium',
          details: `Palette was extracted locally from ${session.primary?.name || 'the uploaded image'} using downsampled canvas analysis.`,
        },
        {
          section: 'logos',
          label: source === 'manual crop' ? 'Manual crop selection' : 'Suggested screenshot crop',
          source: 'uploaded image',
          confidence,
          details: source === 'manual crop' ? 'The logo crop came from the user-selected rectangle.' : 'The crop was inferred from contrast in the top-left brand area.',
        },
      ],
      blocked: [],
      warnings: ['Screenshot mode cannot reliably identify exact font families.'],
      exports: {},
    };

    session.result.exports = buildExports(session.result);
    emit();
  };

  const rebuildFromPrimary = async () => {
    if (!session.primary) return;
    session.primaryImage = await loadImage(session.primary.dataUrl);
    const { samples } = extractPaletteFromImage(session.primaryImage);
    session.palette = groupSimilarColors(samples, 14).slice(0, 12).map((group) => ({ hex: group.hex, weight: group.weight }));
    session.colors = inferImageColorRoles(samples);
    session.suggestedCrop = suggestLogoCrop(session.primaryImage);
    session.crop = session.suggestedCrop;
    session.displayCrop = null;
    applyCropToResult(session.suggestedCrop, session.suggestedCrop.confidence || 'Low', 'suggested crop');
    rerender();
  };

  const setCrop = ({ x, y, width, height, imgRect }) => {
    session.displayCrop = { x, y, width, height };
    const scaleX = session.primaryImage.naturalWidth / imgRect.width;
    const scaleY = session.primaryImage.naturalHeight / imgRect.height;
    session.crop = {
      x: x * scaleX,
      y: y * scaleY,
      width: width * scaleX,
      height: height * scaleY,
    };
    rerender();
  };

  const useCrop = (crop) => {
    if (!crop || crop.width < 8 || crop.height < 8) {
      onToast({ title: 'Crop too small', body: 'Select a larger area before using it as the logo crop.' });
      return;
    }
    applyCropToResult(crop, 'Medium', crop === session.suggestedCrop ? 'suggested crop' : 'manual crop');
    rerender();
  };

  const chooseImage = async (index) => {
    session.primaryIndex = index;
    session.primary = session.files[index];
    await rebuildFromPrimary();
  };

  const rerender = () => {
    if (!session.primary) return;
    renderImageWorkspace(previewArea, session, setCrop, useCrop, chooseImage, async (hex) => {
      await copyText(hex);
      onToast({ title: 'Copied', body: `${hex} copied to the clipboard.` });
    });
  };

  const ingestFiles = async (files) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      onToast({ title: 'No images found', body: 'Only image files can be analyzed in Screenshot / Assets mode.' });
      return;
    }
    session.files = await Promise.all(imageFiles.map(async (file) => ({
      name: file.name,
      type: file.type,
      file,
      dataUrl: await fileToDataUrl(file),
    })));
    session.primaryIndex = 0;
    session.primary = session.files[0];
    await rebuildFromPrimary();
  };

  dropzone.addEventListener('click', () => input.click());
  input.addEventListener('change', async (event) => ingestFiles(event.target.files));

  ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  }));

  ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
  }));

  dropzone.addEventListener('drop', async (event) => ingestFiles(event.dataTransfer.files));

  return {
    clear() {
      previewArea.classList.add('is-empty');
      previewArea.innerHTML = `
        <div class="empty-state">
          <h5>No screenshot loaded</h5>
          <p>Image mode works fully offline once the app is loaded.</p>
        </div>
      `;
    },
  };
}
