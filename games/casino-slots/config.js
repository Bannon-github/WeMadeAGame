/* Shared browser-local configuration for the Casino Slots game and editor. */
'use strict';

const SLOT_DEFAULTS = Object.freeze({
  rows: 3,
  symbols: [
    { id: 'cherry', label: 'Cherry', emoji: '🍒', weight: 30, mult: 5 },
    { id: 'lemon', label: 'Lemon', emoji: '🍋', weight: 25, mult: 10 },
    { id: 'orange', label: 'Orange', emoji: '🍊', weight: 18, mult: 15 },
    { id: 'grape', label: 'Grape', emoji: '🍇', weight: 12, mult: 20 },
    { id: 'bell', label: 'Bell', emoji: '🔔', weight: 8, mult: 30 },
    { id: 'star', label: 'Star', emoji: '⭐', weight: 5, mult: 50 },
    { id: 'seven', label: 'Seven', emoji: '7️⃣', weight: 2, mult: 100 },
  ],
});

const SLOT_AUDIO_EVENTS = Object.freeze([
  { id: 'spin', label: 'Spin starts' },
  { id: 'reel-stop', label: 'Each reel stops' },
  { id: 'win', label: 'Regular win' },
  { id: 'jackpot', label: 'Jackpot win' },
  { id: 'loss', label: 'No win' },
  { id: 'bet', label: 'Bet changes' },
  { id: 'reload', label: 'Credits reload' },
]);

const SLOT_SETTINGS_KEY = 'wmag_slots_settings_v1';
const SLOT_DB_NAME = 'wmag_slots_media_v1';
const SLOT_DB_STORE = 'media';

function getSlotSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SLOT_SETTINGS_KEY)) || {};
  } catch (error) {
    console.warn('Casino Slots settings could not be read; defaults will be used.', error);
  }

  const savedSymbols = new Map(
    Array.isArray(saved.symbols) ? saved.symbols.map(symbol => [symbol.id, symbol]) : []
  );
  return {
    rows: saved.rows === 5 ? 5 : 3,
    symbols: SLOT_DEFAULTS.symbols.map(defaultSymbol => {
      const custom = savedSymbols.get(defaultSymbol.id) || {};
      const weight = Number(custom.weight);
      return {
        ...defaultSymbol,
        weight: Number.isInteger(weight) && weight > 0 ? weight : defaultSymbol.weight,
      };
    }),
  };
}

function saveSlotSettings(settings) {
  localStorage.setItem(SLOT_SETTINGS_KEY, JSON.stringify({
    rows: settings.rows === 5 ? 5 : 3,
    symbols: settings.symbols.map(({ id, weight }) => ({ id, weight })),
  }));
}

function openSlotMediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SLOT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SLOT_DB_STORE)) {
        request.result.createObjectStore(SLOT_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSlotMedia(key) {
  const db = await openSlotMediaDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SLOT_DB_STORE, 'readonly');
    const request = transaction.objectStore(SLOT_DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function setSlotMedia(key, blob) {
  const db = await openSlotMediaDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SLOT_DB_STORE, 'readwrite');
    transaction.objectStore(SLOT_DB_STORE).put(blob, key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteSlotMedia(key) {
  const db = await openSlotMediaDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SLOT_DB_STORE, 'readwrite');
    transaction.objectStore(SLOT_DB_STORE).delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected file is not a readable image.'));
    };
    image.src = url;
  });
}

async function normalizeSlotImage(file) {
  const image = await loadImageFile(file);
  const size = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - size) / 2;
  const sourceY = (image.naturalHeight - size) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 256, 256);
  context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 256, 256);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('The image could not be formatted.')),
      'image/webp',
      0.9
    );
  });
}

window.SlotConfig = {
  defaults: SLOT_DEFAULTS,
  audioEvents: SLOT_AUDIO_EVENTS,
  getSettings: getSlotSettings,
  saveSettings: saveSlotSettings,
  getMedia: getSlotMedia,
  setMedia: setSlotMedia,
  deleteMedia: deleteSlotMedia,
  normalizeImage: normalizeSlotImage,
};
