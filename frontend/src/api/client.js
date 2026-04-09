import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 30000 })

// Cards
export const getCards = () => api.get('/cards/').then(r => r.data)
export const mountCard = (device) => api.post('/cards/mount', { device }).then(r => r.data)
export const unmountCard = (device) => api.post('/cards/unmount', { device }).then(r => r.data)
export const scanCard = (mountPoint) => api.get(`/cards/scan/${mountPoint.replace(/^\//, '')}`).then(r => r.data)

// Files
export const startCopy = (sourcePaths, copyType) =>
  api.post('/files/copy', { source_paths: sourcePaths, copy_type: copyType }).then(r => r.data)
export const getJob = (jobId) => api.get(`/files/jobs/${jobId}`).then(r => r.data)

// Images
export const listImages = (folder = '') => api.get('/images/list', { params: { folder } }).then(r => r.data)
export const getExif = (path) => api.get('/images/exif', { params: { path } }).then(r => r.data)
export const deleteImages = (paths) => api.post('/images/delete', { paths }).then(r => r.data)
export const restoreImages = (paths) => api.post('/images/restore', { paths }).then(r => r.data)
export const listTrash = () => api.get('/images/trash').then(r => r.data)
export const updateTags = (path, tags, rating, label) =>
  api.post('/images/tags', { path, tags, rating, label }).then(r => r.data)
export const thumbnailUrl = (path, size = 400) =>
  `/api/images/thumbnail?path=${encodeURIComponent(path)}&size=${size}`

// AI
export const getAiStatus = () => api.get('/ai/status').then(r => r.data)
export const startAnalysis = (paths, generatePresets = true) =>
  api.post('/ai/analyze', { paths, generate_presets: generatePresets }).then(r => r.data)
export const getAnalysisJob = (jobId) => api.get(`/ai/jobs/${jobId}`).then(r => r.data)

// NAS
export const getNasStatus = () => api.get('/nas/status').then(r => r.data)
export const mountNas = () => api.post('/nas/mount').then(r => r.data)
export const unmountNas = () => api.post('/nas/unmount').then(r => r.data)
export const startNasCopy = (paths) => api.post('/nas/copy', { paths }).then(r => r.data)
export const getNasJob = (jobId) => api.get(`/nas/jobs/${jobId}`).then(r => r.data)

// System
export const getSystemStats = () => api.get('/system/stats').then(r => r.data)

export default api
