import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  // ─── Theme ─────────────────────────────────────────────────────────
  theme: localStorage.getItem('pf_theme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('pf_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  // ─── Navigation ────────────────────────────────────────────────────
  activeView: 'cards',   // cards | culling | ai | nas
  setActiveView: (v) => set({ activeView: v }),

  // ─── Speicherkarten ────────────────────────────────────────────────
  cards: [],
  setCards: (cards) => set({ cards }),

  // ─── Staging Bilder ────────────────────────────────────────────────
  images: [],
  setImages: (images) => set({ images }),
  selectedImages: new Set(),
  toggleSelect: (path) => set(s => {
    const sel = new Set(s.selectedImages)
    sel.has(path) ? sel.delete(path) : sel.add(path)
    return { selectedImages: sel }
  }),
  selectAll: () => set(s => ({ selectedImages: new Set(s.images.map(i => i.path)) })),
  clearSelection: () => set({ selectedImages: new Set() }),
  markedForDelete: new Set(),
  toggleDelete: (path) => set(s => {
    const del = new Set(s.markedForDelete)
    del.has(path) ? del.delete(path) : del.add(path)
    return { markedForDelete: del }
  }),
  undoDelete: () => set(s => {
    const del = new Set(s.markedForDelete)
    const last = [...del].pop()
    if (last) del.delete(last)
    return { markedForDelete: del }
  }),

  // ─── Vollbild ──────────────────────────────────────────────────────
  fullscreenImage: null,
  fullscreenIndex: 0,
  openFullscreen: (path, index) => set({ fullscreenImage: path, fullscreenIndex: index }),
  closeFullscreen: () => set({ fullscreenImage: null }),

  // ─── Rating / Labels ───────────────────────────────────────────────
  imageRatings: {},
  imageLabels: {},
  setRating: (path, rating) => set(s => ({ imageRatings: { ...s.imageRatings, [path]: rating } })),
  setLabel: (path, label) => set(s => ({ imageLabels: { ...s.imageLabels, [path]: label } })),

  // ─── AI Analyse ────────────────────────────────────────────────────
  aiResults: {},
  setAiResults: (results) => set(s => ({ aiResults: { ...s.aiResults, ...results } })),

  // ─── System Stats ──────────────────────────────────────────────────
  systemStats: null,
  setSystemStats: (stats) => set({ systemStats: stats }),

  // ─── NAS Status ────────────────────────────────────────────────────
  nasStatus: null,
  setNasStatus: (status) => set({ nasStatus: status }),

  // ─── Jobs / Fortschritt ────────────────────────────────────────────
  activeJobs: {},
  setJob: (id, data) => set(s => ({ activeJobs: { ...s.activeJobs, [id]: data } })),

  // ─── Folder Browser ────────────────────────────────────────────────
  currentFolder: '',
  setCurrentFolder: (f) => set({ currentFolder: f }),
  folders: [],
  setFolders: (folders) => set({ folders }),
}))
