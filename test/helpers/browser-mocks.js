'use strict';

class ClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.classList = new ClassList();
    this.listeners = new Map();
    this.children = [];
    this.scrollHeight = 0;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.clientWidth = 500;
    this.offsetWidth = 500;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.clickCalls = 0;
    this.parentElement = {
      classList: new ClassList(),
      style: {}
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type, overrides = {}) {
    const event = {
      target: this,
      currentTarget: this,
      key: '',
      preventDefault() {},
      stopPropagation() {},
      ...overrides
    };
    for (const listener of this.listeners.get(type) || []) {
      await listener(event);
    }
    return event;
  }

  click() {
    this.clickCalls += 1;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
  }

  remove() {}

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector(selector) {
    return new MockElement(selector);
  }

  getBoundingClientRect() {
    return { width: 360, height: 20 };
  }
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createBrowserContext(options = {}) {
  const elements = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();

  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, new MockElement(id));
    return elements.get(id);
  };

  const documentElement = new MockElement('html');
  const body = new MockElement('body');
  const querySelector = (selector) => {
    if (selector === '.time-frame-timer') return getElement('timerContainer');
    return getElement(`selector:${selector}`);
  };

  const document = {
    readyState: options.readyState || 'complete',
    documentElement,
    body,
    getElementById: getElement,
    querySelector,
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return new MockElement(tagName);
    },
    createTextNode(text) {
      return { textContent: String(text) };
    },
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    }
  };

  const navigator = {
    userAgent: options.userAgent || 'Mozilla/5.0',
    platform: 'Test',
    language: 'en-US',
    languages: ['en-US'],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    cookieEnabled: true,
    maxTouchPoints: 0,
    clipboard: {
      async writeText() {}
    }
  };

  const window = {
    document,
    navigator,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2,
    screen: {
      width: 1920,
      height: 1080,
      availWidth: 1920,
      availHeight: 1040
    },
    location: {
      href: 'https://example.test/index.html',
      hash: ''
    },
    history: {
      pushState() {}
    },
    matchMedia() {
      return { matches: false };
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    getComputedStyle() {
      return {
        paddingLeft: '0',
        paddingRight: '0',
        fontFamily: 'sans-serif',
        fontSize: '16px',
        font: '16px sans-serif',
        lineHeight: '20px'
      };
    }
  };
  window.window = window;

  const context = {
    window,
    self: window,
    document,
    navigator,
    history: window.history,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    console: options.console || {
      info() {},
      warn() {},
      error() {},
      log() {}
    },
    Intl,
    Date,
    Math,
    Number,
    String,
    Array,
    Map,
    Set,
    Blob,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    URL,
    Promise,
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    getComputedStyle() {
      return {
        paddingLeft: '0',
        paddingRight: '0',
        fontFamily: 'sans-serif',
        fontSize: '16px',
        font: '16px sans-serif',
        lineHeight: '20px'
      };
    },
    Worker: class {
      addEventListener() {}
      postMessage() {}
    },
    JSZip: undefined
  };
  Object.assign(context, options.globals || {});

  return {
    context,
    document,
    window,
    navigator,
    elements,
    getElement,
    documentListeners,
    windowListeners
  };
}

module.exports = {
  ClassList,
  MockElement,
  createBrowserContext,
  createStorage
};
