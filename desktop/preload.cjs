'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (method, ...values) => ipcRenderer.invoke(`my-jinni:${method}`, ...values);

contextBridge.exposeInMainWorld('myJinni', Object.freeze({
  getOptions: () => invoke('getOptions'),
  recommend: (preferences) => invoke('recommend', preferences),
  getDecisionScenarios: () => invoke('getDecisionScenarios'),
  getDecisionScenario: (id) => invoke('getDecisionScenario', id),
  evaluateDecision: (request) => invoke('evaluateDecision', request),
  listSources: () => invoke('listSources'),
  addTextSource: (source) => invoke('addTextSource', source),
  importSource: (options) => invoke('importSource', options),
  getSource: (id) => invoke('getSource', id),
  deleteSource: (id) => invoke('deleteSource', id),
  askQuestion: (question) => invoke('askQuestion', question),
  setSessionApiKey: (key) => invoke('setSessionApiKey', key),
  clearSessionApiKey: (provider) => invoke('clearSessionApiKey', provider),
  getSessionSettings: (provider) => invoke('getSessionSettings', provider),
  getBackendStatus: () => invoke('getBackendStatus'),
  retryBackend: () => invoke('retryBackend'),
}));
