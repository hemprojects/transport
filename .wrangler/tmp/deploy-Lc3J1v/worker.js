var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var isWorkerdProcessV2 = globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
var unenvProcess = new Process({
  env: globalProcess.env,
  // `hrtime` is only available from workerd process v2
  hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  // Always implemented by workerd
  env,
  // Only implemented in workerd v2
  hrtime: hrtime3,
  // Always implemented by workerd
  nextTick
} = unenvProcess;
var {
  _channel,
  _disconnect,
  _events,
  _eventsCount,
  _handleQueue,
  _maxListeners,
  _pendingMessage,
  _send,
  assert: assert2,
  disconnect,
  mainModule
} = unenvProcess;
var {
  // @ts-expect-error `_debugEnd` is missing typings
  _debugEnd,
  // @ts-expect-error `_debugProcess` is missing typings
  _debugProcess,
  // @ts-expect-error `_exiting` is missing typings
  _exiting,
  // @ts-expect-error `_fatalException` is missing typings
  _fatalException,
  // @ts-expect-error `_getActiveHandles` is missing typings
  _getActiveHandles,
  // @ts-expect-error `_getActiveRequests` is missing typings
  _getActiveRequests,
  // @ts-expect-error `_kill` is missing typings
  _kill,
  // @ts-expect-error `_linkedBinding` is missing typings
  _linkedBinding,
  // @ts-expect-error `_preload_modules` is missing typings
  _preload_modules,
  // @ts-expect-error `_rawDebug` is missing typings
  _rawDebug,
  // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
  _startProfilerIdleNotifier,
  // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
  _stopProfilerIdleNotifier,
  // @ts-expect-error `_tickCallback` is missing typings
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  availableMemory,
  // @ts-expect-error `binding` is missing typings
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  // @ts-expect-error `domain` is missing typings
  domain,
  emit,
  emitWarning,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  // @ts-expect-error `initgroups` is missing typings
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  memoryUsage,
  // @ts-expect-error `moduleLoadList` is missing typings
  moduleLoadList,
  off,
  on,
  once,
  // @ts-expect-error `openStdin` is missing typings
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  // @ts-expect-error `reallyExit` is missing typings
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../usr/local/share/nvm/versions/node/v24.11.1/lib/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/worker.js
async function hashPin(pin) {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPin, "hashPin");
function generateToken() {
  return crypto.randomUUID();
}
__name(generateToken, "generateToken");
async function checkLoginRateLimit(env2, identifier) {
  const record = await env2.DB.prepare(
    "SELECT attempts, blocked_until FROM login_attempts WHERE identifier = ?"
  ).bind(identifier).first();
  if (record && record.blocked_until) {
    const blockedUntil = new Date(record.blocked_until);
    const now = /* @__PURE__ */ new Date();
    if (blockedUntil > now) {
      const minutesLeft = Math.ceil((blockedUntil - now) / 6e4);
      return { blocked: true, minutesLeft };
    }
  }
  return { blocked: false, attempts: record?.attempts || 0 };
}
__name(checkLoginRateLimit, "checkLoginRateLimit");
async function recordLoginResult(env2, identifier, success) {
  const now = /* @__PURE__ */ new Date();
  if (success) {
    await env2.DB.prepare("DELETE FROM login_attempts WHERE identifier = ?").bind(identifier).run();
    return;
  }
  const record = await env2.DB.prepare(
    "SELECT attempts FROM login_attempts WHERE identifier = ?"
  ).bind(identifier).first();
  const newAttempts = (record?.attempts || 0) + 1;
  let blockedUntil = null;
  if (newAttempts >= 5) {
    const blockTime = new Date(now.getTime() + 15 * 6e4);
    blockedUntil = blockTime.toISOString();
  }
  if (record) {
    await env2.DB.prepare(
      "UPDATE login_attempts SET attempts = ?, blocked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE identifier = ?"
    ).bind(newAttempts, blockedUntil, identifier).run();
  } else {
    await env2.DB.prepare(
      "INSERT INTO login_attempts (identifier, attempts, blocked_until) VALUES (?, ?, ?)"
    ).bind(identifier, newAttempts, blockedUntil).run();
  }
}
__name(recordLoginResult, "recordLoginResult");
async function verifySession(request, env2) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const session = await env2.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!session) return null;
  if (new Date(session.expires_at) < /* @__PURE__ */ new Date()) {
    await env2.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return session.user_id;
}
__name(verifySession, "verifySession");
async function handleAPI(request, env2, path, corsHeaders) {
  const method = request.method;
  if (path === "/api/auth/login" && method === "POST")
    return await login(request, env2, corsHeaders);
  if (path === "/api/users" && method === "GET" && !request.headers.get("Authorization")) {
    const result = await env2.DB.prepare(
      "SELECT id, name, role FROM users WHERE active = 1 ORDER BY role DESC, name"
    ).all();
    return new Response(JSON.stringify(result.results), {
      headers: corsHeaders
    });
  }
  const userId = await verifySession(request, env2);
  if (!userId)
    return new Response(JSON.stringify({ error: "Sesja wygas\u0142a" }), {
      status: 401,
      headers: corsHeaders
    });
  if (path === "/api/users" && method === "GET")
    return await getUsers(env2, corsHeaders);
  if (path === "/api/users" && method === "POST")
    return await createUser(request, env2, corsHeaders);
  if (path.match(/^\/api\/users\/\d+$/) && method === "DELETE")
    return await deleteUser(path.split("/").pop(), env2, corsHeaders);
  if (path.match(/^\/api\/users\/\d+$/) && method === "PUT")
    return await updateUser(path.split("/").pop(), request, env2, corsHeaders);
  if (path === "/api/locations" && method === "GET")
    return await getLocations(env2, corsHeaders);
  if (path === "/api/locations" && method === "POST")
    return await createLocation(request, env2, corsHeaders);
  if (path.match(/^\/api\/locations\/\d+$/) && method === "DELETE")
    return await deleteLocation(path.split("/").pop(), env2, corsHeaders);
  if (path === "/api/tasks" && method === "GET")
    return await getTasks(new URL(request.url).searchParams, env2, corsHeaders);
  if (path === "/api/tasks" && method === "POST")
    return await createTask3(request, env2, corsHeaders, userId);
  if (path.match(/^\/api\/tasks\/\d+$/) && method === "GET")
    return await getTask(path.split("/").pop(), env2, corsHeaders);
  if (path.match(/^\/api\/tasks\/\d+$/) && method === "PUT")
    return await updateTask(
      path.split("/").pop(),
      request,
      env2,
      corsHeaders,
      userId
    );
  if (path.match(/^\/api\/tasks\/\d+$/) && method === "DELETE")
    return await deleteTask(path.split("/").pop(), env2, corsHeaders);
  if (path.match(/^\/api\/tasks\/\d+\/status$/) && method === "PUT")
    return await updateTaskStatus(
      path.split("/")[3],
      request,
      env2,
      corsHeaders
    );
  if (path.match(/^\/api\/tasks\/\d+\/join$/) && method === "POST")
    return await joinTask(path.split("/")[3], request, env2, corsHeaders);
  if (path === "/api/tasks/reorder" && method === "POST")
    return await reorderTasks(request, env2, corsHeaders);
  if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === "GET")
    return await getTaskLogs(path.split("/")[3], env2, corsHeaders);
  if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === "POST")
    return await createTaskLog(path.split("/")[3], request, env2, corsHeaders);
  if (path.match(/^\/api\/notifications\/\d+$/) && method === "GET")
    return await getNotifications(path.split("/").pop(), env2, corsHeaders);
  if (path.match(/^\/api\/notifications\/\d+\/read$/) && method === "POST")
    return await markNotificationRead(path.split("/")[3], env2, corsHeaders);
  if (path.match(/^\/api\/notifications\/user\/\d+\/read-all$/) && method === "POST")
    return await markAllNotificationsRead(path.split("/")[4], env2, corsHeaders);
  if (path.match(/^\/api\/notifications\/user\/\d+\/delete-read$/) && method === "DELETE")
    return await deleteReadNotifications(path.split("/")[4], env2, corsHeaders);
  if (path === "/api/reports" && method === "GET")
    return await getReports(
      new URL(request.url).searchParams.get("period") || "week",
      env2,
      corsHeaders
    );
  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: corsHeaders
  });
}
__name(handleAPI, "handleAPI");
async function login(request, env2, corsHeaders) {
  const { userId, pin } = await request.json();
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const identifier = `${clientIP}:${userId}`;
  const limit = await checkLoginRateLimit(env2, identifier);
  if (limit.blocked)
    return new Response(
      JSON.stringify({ error: `Blokada na ${limit.minutesLeft} min.` }),
      { status: 429, headers: corsHeaders }
    );
  const user = await env2.DB.prepare(
    "SELECT id, name, role, pin, force_pin_change, work_start, work_end, perm_users, perm_locations, perm_reports FROM users WHERE id = ? AND active = 1"
  ).bind(userId).first();
  if (!user) {
    await recordLoginResult(env2, identifier, false);
    return new Response(JSON.stringify({ error: "B\u0142\u0119dne dane" }), {
      status: 401,
      headers: corsHeaders
    });
  }
  const inputHash = await hashPin(pin);
  let isValid = false;
  let needsMigration = false;
  if (user.pin === pin) {
    isValid = true;
    needsMigration = true;
  } else if (user.pin === inputHash) {
    isValid = true;
  }
  if (!isValid) {
    await recordLoginResult(env2, identifier, false);
    return new Response(JSON.stringify({ error: "B\u0142\u0119dny PIN" }), {
      status: 401,
      headers: corsHeaders
    });
  }
  await recordLoginResult(env2, identifier, true);
  if (needsMigration)
    await env2.DB.prepare("UPDATE users SET pin = ? WHERE id = ?").bind(inputHash, user.id).run();
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1e3
  ).toISOString();
  await env2.DB.prepare(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
  ).bind(user.id, token, expiresAt).run();
  delete user.pin;
  return new Response(JSON.stringify({ user, token }), {
    headers: corsHeaders
  });
}
__name(login, "login");
async function getUsers(env2, corsHeaders) {
  const result = await env2.DB.prepare(
    "SELECT id, name, role, work_start, work_end, perm_users, perm_locations, perm_reports FROM users WHERE active = 1 ORDER BY role DESC, name"
  ).all();
  return new Response(JSON.stringify(result.results), { headers: corsHeaders });
}
__name(getUsers, "getUsers");
async function createUser(request, env2, corsHeaders) {
  const {
    name,
    pin,
    role,
    work_start,
    work_end,
    force_pin_change,
    perm_users,
    perm_locations,
    perm_reports
  } = await request.json();
  const hashedPin = await hashPin(pin);
  const p_users = perm_users !== void 0 ? perm_users : role === "admin" ? 1 : 0;
  const p_loc = perm_locations !== void 0 ? perm_locations : role === "admin" ? 1 : 0;
  const p_rep = perm_reports !== void 0 ? perm_reports : role === "admin" ? 1 : 0;
  const workStart = role === "driver" ? work_start || "07:00" : null;
  const workEnd = role === "driver" ? work_end || "15:00" : null;
  const result = await env2.DB.prepare(
    "INSERT INTO users (name, pin, role, work_start, work_end, force_pin_change, perm_users, perm_locations, perm_reports) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    name,
    hashedPin,
    role,
    workStart,
    workEnd,
    force_pin_change || 1,
    p_users,
    p_loc,
    p_rep
  ).run();
  return new Response(
    JSON.stringify({ id: result.meta.last_row_id, name, role }),
    { headers: corsHeaders }
  );
}
__name(createUser, "createUser");
async function updateUser(id, request, env2, corsHeaders) {
  const {
    name,
    pin,
    role,
    work_start,
    work_end,
    force_pin_change,
    perm_users,
    perm_locations,
    perm_reports
  } = await request.json();
  let q = "UPDATE users SET ";
  let p = [];
  let u = [];
  if (name) {
    u.push("name = ?");
    p.push(name);
  }
  if (role) {
    u.push("role = ?");
    p.push(role);
  }
  if (work_start) {
    u.push("work_start = ?");
    p.push(work_start);
  }
  if (work_end) {
    u.push("work_end = ?");
    p.push(work_end);
  }
  if (force_pin_change !== void 0) {
    u.push("force_pin_change = ?");
    p.push(force_pin_change);
  }
  if (perm_users !== void 0) {
    u.push("perm_users = ?");
    p.push(perm_users);
  }
  if (perm_locations !== void 0) {
    u.push("perm_locations = ?");
    p.push(perm_locations);
  }
  if (perm_reports !== void 0) {
    u.push("perm_reports = ?");
    p.push(perm_reports);
  }
  if (pin) {
    u.push("pin = ?");
    p.push(await hashPin(pin));
  }
  if (u.length === 0)
    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders
    });
  q += u.join(", ") + " WHERE id = ?";
  p.push(id);
  await env2.DB.prepare(q).bind(...p).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(updateUser, "updateUser");
async function deleteUser(id, env2, corsHeaders) {
  await env2.DB.prepare("UPDATE users SET active = 0 WHERE id = ?").bind(id).run();
  await env2.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  await env2.DB.prepare("DELETE FROM pushy_tokens WHERE user_id = ?").bind(id).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(deleteUser, "deleteUser");
async function getLocations(env2, corsHeaders) {
  const r = await env2.DB.prepare(
    "SELECT * FROM locations WHERE active = 1 ORDER BY type, name"
  ).all();
  return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}
__name(getLocations, "getLocations");
async function createLocation(request, env2, corsHeaders) {
  const { name, type } = await request.json();
  const ex = await env2.DB.prepare(
    "SELECT id, active FROM locations WHERE name = ?"
  ).bind(name).first();
  if (ex) {
    if (ex.active === 0) {
      await env2.DB.prepare(
        "UPDATE locations SET active = 1, type = ? WHERE id = ?"
      ).bind(type, ex.id).run();
      return new Response(JSON.stringify({ id: ex.id, name, type }), {
        headers: corsHeaders
      });
    }
    return new Response(JSON.stringify({ error: "Ju\u017C istnieje" }), {
      status: 400,
      headers: corsHeaders
    });
  }
  const r = await env2.DB.prepare(
    "INSERT INTO locations (name, type) VALUES (?, ?)"
  ).bind(name, type).run();
  return new Response(JSON.stringify({ id: r.meta.last_row_id, name, type }), {
    headers: corsHeaders
  });
}
__name(createLocation, "createLocation");
async function deleteLocation(id, env2, corsHeaders) {
  await env2.DB.prepare("UPDATE locations SET active = 0 WHERE id = ?").bind(id).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(deleteLocation, "deleteLocation");
async function getTasks(params, env2, corsHeaders) {
  const date = params.get("date");
  const status = params.get("status");
  let q = `SELECT t.*, u.name as assigned_name, c.name as creator_name, t.created_by as creator_id FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id WHERE 1=1`;
  let b = [];
  if (date) {
    q += " AND t.scheduled_date = ?";
    b.push(date);
  }
  if (status && status !== "all") {
    q += " AND t.status = ?";
    b.push(status);
  }
  q += ` ORDER BY CASE t.status WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 WHEN 'completed' THEN 3 END, CASE t.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.sort_order ASC, t.scheduled_time ASC`;
  const r = await env2.DB.prepare(q).bind(...b).all();
  return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}
__name(getTasks, "getTasks");
async function getTask(id, env2, corsHeaders) {
  const task = await env2.DB.prepare(
    `SELECT t.*, u.name as assigned_name, c.name as creator_name, t.created_by as creator_id FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id WHERE t.id = ?`
  ).bind(id).first();
  if (!task)
    return new Response(JSON.stringify({ error: "Nie znaleziono" }), {
      status: 404,
      headers: corsHeaders
    });
  const logs = await env2.DB.prepare(
    `SELECT tl.*, u.name as user_name FROM task_logs tl LEFT JOIN users u ON tl.user_id = u.id WHERE tl.task_id = ? ORDER BY tl.created_at DESC`
  ).bind(id).all();
  task.logs = logs.results;
  const drivers = await env2.DB.prepare(
    `SELECT u.id, u.name FROM task_drivers td JOIN users u ON td.user_id = u.id WHERE td.task_id = ?`
  ).bind(id).all();
  task.additional_drivers = drivers.results;
  return new Response(JSON.stringify(task), { headers: corsHeaders });
}
__name(getTask, "getTask");
async function createTask3(request, env2, corsHeaders, userId) {
  const data = await request.json();
  const maxOrder = await env2.DB.prepare(
    "SELECT MAX(sort_order) as max FROM tasks WHERE scheduled_date = ?"
  ).bind(data.scheduled_date).first();
  const sortOrder = (maxOrder?.max || 0) + 1;
  const res = await env2.DB.prepare(
    `INSERT INTO tasks (task_type, description, material, location_from, location_to, department, scheduled_date, scheduled_time, priority, sort_order, notes, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    data.task_type || "transport",
    data.description,
    data.material || null,
    data.location_from || null,
    data.location_to || null,
    data.department || null,
    data.scheduled_date,
    data.scheduled_time || null,
    data.priority || "normal",
    sortOrder,
    data.notes || null,
    userId,
    data.assigned_to || null
  ).run();
  const taskId = res.meta.last_row_id;
  const drivers = await env2.DB.prepare(
    'SELECT id FROM users WHERE role = "driver" AND active = 1'
  ).all();
  const driverIds = new Set(drivers.results.map((u) => u.id));
  if (data.assigned_to) {
    driverIds.add(data.assigned_to);
  }
  const origin = new URL(request.url).origin;
  await notifyUsers(
    Array.from(driverIds),
    "new_task",
    "Nowe zadanie",
    `Nowe zadanie: ${data.description}`,
    taskId,
    origin,
    env2
  );
  return new Response(JSON.stringify({ id: taskId, success: true }), {
    headers: corsHeaders
  });
}
__name(createTask3, "createTask");
async function updateTask(id, request, env2, corsHeaders, userId) {
  const data = await request.json();
  const task = await env2.DB.prepare("SELECT created_by FROM tasks WHERE id = ?").bind(id).first();
  if (userId !== 1 && task.created_by !== userId)
    return new Response(JSON.stringify({ error: "Brak uprawnie\u0144" }), {
      status: 403,
      headers: corsHeaders
    });
  await env2.DB.prepare(
    `UPDATE tasks SET task_type = ?, description = ?, material = ?, location_from = ?, location_to = ?, department = ?, scheduled_date = ?, scheduled_time = ?, priority = ?, notes = ?, assigned_to = ? WHERE id = ?`
  ).bind(
    data.task_type || "transport",
    data.description,
    data.material || null,
    data.location_from || null,
    data.location_to || null,
    data.department || null,
    data.scheduled_date,
    data.scheduled_time || null,
    data.priority || "normal",
    data.notes || null,
    data.assigned_to || null,
    id
  ).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(updateTask, "updateTask");
async function deleteTask(id, env2, corsHeaders) {
  await env2.DB.prepare("DELETE FROM task_logs WHERE task_id = ?").bind(id).run();
  await env2.DB.prepare("DELETE FROM task_drivers WHERE task_id = ?").bind(id).run();
  await env2.DB.prepare("DELETE FROM notifications WHERE task_id = ?").bind(id).run();
  await env2.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(deleteTask, "deleteTask");
async function updateTaskStatus(id, request, env2, corsHeaders) {
  const { status, userId } = await request.json();
  let q = "UPDATE tasks SET status = ?";
  let b = [status];
  if (status === "in_progress") {
    q += ", started_at = CURRENT_TIMESTAMP, assigned_to = ?";
    b.push(userId);
  } else if (status === "completed") {
    q += ", completed_at = CURRENT_TIMESTAMP";
  }
  q += " WHERE id = ?";
  b.push(id);
  await env2.DB.prepare(q).bind(...b).run();
  const statusLabels = {
    in_progress: "Rozpocz\u0119to",
    completed: "Zako\u0144czono",
    pending: "Oczekuje"
  };
  await env2.DB.prepare(
    "INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)"
  ).bind(id, userId, "status_change", statusLabels[status] || status).run();
  const task = await env2.DB.prepare(
    "SELECT description, created_by, assigned_to FROM tasks WHERE id = ?"
  ).bind(id).first();
  const statusText = status === "in_progress" ? "rozpocz\u0119te" : status === "completed" ? "zako\u0144czone" : status;
  const origin = new URL(request.url).origin;
  if (task.created_by && task.created_by != userId) {
    await env2.DB.prepare(
      "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      task.created_by,
      "status_change",
      "Zmiana statusu",
      `"${task.description}" - ${statusText}`,
      id
    ).run();
    await sendOneSignalNotification(
      [task.created_by],
      "Zmiana statusu",
      `"${task.description}" - ${statusText}`,
      { taskId: id },
      origin,
      env2
    );
  } else if (!task.created_by) {
    const admins = await env2.DB.prepare(
      'SELECT id FROM users WHERE role = "admin" AND active = 1'
    ).all();
    for (const a of admins.results) {
      if (a.id == userId) continue;
      await env2.DB.prepare(
        "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
      ).bind(
        a.id,
        "status_change",
        "Zmiana statusu",
        `"${task.description}" - ${statusText}`,
        id
      ).run();
      await sendOneSignalNotification(
        [a.id],
        "Zmiana statusu",
        `"${task.description}" - ${statusText}`,
        { taskId: id },
        origin,
        env2
      );
    }
  }
  if (task.assigned_to && task.assigned_to != userId) {
    await env2.DB.prepare(
      "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      task.assigned_to,
      "status_change",
      "Aktualizacja zadania",
      `"${task.description}" - ${statusText}`,
      id
    ).run();
    await sendOneSignalNotification(
      [task.assigned_to],
      "Aktualizacja zadania",
      `"${task.description}" - ${statusText}`,
      { taskId: id },
      origin,
      env2
    );
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(updateTaskStatus, "updateTaskStatus");
async function joinTask(id, request, env2, corsHeaders) {
  const { userId } = await request.json();
  const ex = await env2.DB.prepare(
    "SELECT id FROM task_drivers WHERE task_id = ? AND user_id = ?"
  ).bind(id, userId).first();
  if (ex)
    return new Response(JSON.stringify({ error: "Ju\u017C do\u0142\u0105czy\u0142e\u015B" }), {
      status: 400,
      headers: corsHeaders
    });
  await env2.DB.prepare(
    "INSERT INTO task_drivers (task_id, user_id) VALUES (?, ?)"
  ).bind(id, userId).run();
  const user = await env2.DB.prepare("SELECT name FROM users WHERE id = ?").bind(userId).first();
  await env2.DB.prepare(
    "INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)"
  ).bind(id, userId, "status_change", `${user.name} do\u0142\u0105czy\u0142`).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(joinTask, "joinTask");
async function reorderTasks(request, env2, corsHeaders) {
  const { tasks, reason, userId } = await request.json();
  for (let i = 0; i < tasks.length; i++)
    await env2.DB.prepare("UPDATE tasks SET sort_order = ? WHERE id = ?").bind(i + 1, tasks[i]).run();
  if (reason && tasks.length > 0) {
    const user = await env2.DB.prepare("SELECT name FROM users WHERE id = ?").bind(userId).first();
    await env2.DB.prepare(
      "INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)"
    ).bind(
      tasks[0],
      userId,
      "status_change",
      `Zmiana kolejno\u015Bci przez ${user.name}: ${reason}`
    ).run();
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(reorderTasks, "reorderTasks");
async function getTaskLogs(id, env2, corsHeaders) {
  const r = await env2.DB.prepare(
    "SELECT tl.*, u.name as user_name FROM task_logs tl LEFT JOIN users u ON tl.user_id = u.id WHERE tl.task_id = ? ORDER BY tl.created_at DESC"
  ).bind(id).all();
  return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}
__name(getTaskLogs, "getTaskLogs");
async function createTaskLog(id, request, env2, corsHeaders) {
  const { userId, logType, message, delayReason, delayMinutes } = await request.json();
  const safeMessage = message || null;
  const safeReason = delayReason || null;
  const safeMinutes = delayMinutes || null;
  await env2.DB.prepare(
    `INSERT INTO task_logs (task_id, user_id, log_type, message, delay_reason, delay_minutes) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, logType, safeMessage, safeReason, safeMinutes).run();
  if (logType === "delay" || logType === "problem") {
    const task = await env2.DB.prepare(
      "SELECT description, created_by FROM tasks WHERE id = ?"
    ).bind(id).first();
    const user = await env2.DB.prepare("SELECT name FROM users WHERE id = ?").bind(userId).first();
    const title2 = logType === "delay" ? "\u23F1\uFE0F Przest\xF3j" : "\u26A0\uFE0F Problem";
    const delayLabels = {
      no_access: "Brak dojazdu",
      waiting: "Oczekiwanie",
      traffic: "Korki",
      equipment: "Problem ze sprz\u0119tem",
      weather: "Pogoda",
      break: "Przerwa",
      other: "Inny"
    };
    const msgText = logType === "delay" ? `${user.name}: ${delayLabels[safeReason] || safeReason} (${safeMinutes || 0} min)` : `${user.name}: ${safeMessage}`;
    const origin = new URL(request.url).origin;
    if (task.created_by) {
      await env2.DB.prepare(
        "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
      ).bind(task.created_by, logType, title2, msgText, id).run();
      await sendOneSignalNotification(
        [task.created_by],
        title2,
        msgText,
        { taskId: id },
        origin,
        env2
      );
    } else {
      const admins = await env2.DB.prepare(
        'SELECT id FROM users WHERE role = "admin" AND active = 1'
      ).all();
      for (const a of admins.results) {
        await env2.DB.prepare(
          "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
        ).bind(a.id, logType, title2, msgText, id).run();
        await sendOneSignalNotification(
          [a.id],
          title2,
          msgText,
          { taskId: id },
          origin,
          env2
        );
      }
    }
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(createTaskLog, "createTaskLog");
async function getNotifications(uid, env2, corsHeaders) {
  console.log(`\u{1F4EC} getNotifications called for user: ${uid}`);
  const r = await env2.DB.prepare(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(uid).all();
  const c = await env2.DB.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0"
  ).bind(uid).first();
  console.log(`\u{1F4EC} getNotifications result: ${r.results.length} notifications, ${c.count} unread`);
  return new Response(
    JSON.stringify({ notifications: r.results, unreadCount: c.count }),
    { headers: corsHeaders }
  );
}
__name(getNotifications, "getNotifications");
async function markNotificationRead(id, env2, corsHeaders) {
  await env2.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").bind(id).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(markNotificationRead, "markNotificationRead");
async function markAllNotificationsRead(uid, env2, corsHeaders) {
  await env2.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").bind(uid).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(markAllNotificationsRead, "markAllNotificationsRead");
async function deleteReadNotifications(uid, env2, corsHeaders) {
  await env2.DB.prepare(
    "DELETE FROM notifications WHERE user_id = ? AND is_read = 1"
  ).bind(uid).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders
  });
}
__name(deleteReadNotifications, "deleteReadNotifications");
async function getReports(period, env2, corsHeaders) {
  let dateCondition = "";
  let isSingleDay = false;
  if (period.includes("-")) {
    if (period.length === 7) {
      dateCondition = `AND strftime('%Y-%m', t.scheduled_date) = '${period}'`;
    } else {
      dateCondition = `AND t.scheduled_date = '${period}'`;
      isSingleDay = true;
    }
  } else if (period === "week") {
    dateCondition = `AND t.scheduled_date >= date('now', '-7 days')`;
  } else if (period === "today") {
    dateCondition = `AND t.scheduled_date = date('now')`;
    isSingleDay = true;
  }
  const drivers = await env2.DB.prepare(
    `SELECT id, name, work_start, work_end FROM users WHERE role = 'driver' AND active = 1`
  ).all();
  const driversStats = [];
  const now = /* @__PURE__ */ new Date();
  for (const driver of drivers.results) {
    const tasks = await env2.DB.prepare(
      `
            SELECT t.id, t.description, t.status, t.started_at, t.completed_at, t.scheduled_date
            FROM tasks t LEFT JOIN task_drivers td ON t.id = td.task_id
            WHERE (t.assigned_to = ? OR td.user_id = ?) ${dateCondition}
            AND t.started_at IS NOT NULL
            ORDER BY t.started_at
        `
    ).bind(driver.id, driver.id).all();
    const delays = await env2.DB.prepare(
      `
            SELECT tl.delay_minutes, tl.delay_reason, tl.created_at, t.id as task_id 
            FROM task_logs tl
            LEFT JOIN tasks t ON tl.task_id = t.id
            WHERE tl.user_id = ? AND tl.log_type = 'delay' ${dateCondition}
            ORDER BY tl.created_at
        `
    ).bind(driver.id).all();
    let workMinutes = 0;
    let delayMinutes = 0;
    let timeline = [];
    let details = [];
    tasks.results.forEach((t) => {
      const start = new Date(t.started_at);
      const end = t.completed_at ? new Date(t.completed_at) : now;
      const duration = Math.max(0, (end - start) / 1e3 / 60);
      const type = t.status === "in_progress" ? "work-live" : "work";
      if (isSingleDay) {
        timeline.push({
          type,
          start: t.started_at,
          end: end.toISOString(),
          desc: t.description,
          duration: Math.round(duration)
        });
        details.push({
          time: start.toLocaleTimeString("pl-PL", {
            hour: "2-digit",
            minute: "2-digit"
          }),
          desc: t.description,
          duration: Math.round(duration),
          type
        });
        const taskDelays = delays.results.filter((d) => d.task_id === t.id);
        taskDelays.forEach((d) => {
          const delayStart = new Date(d.created_at);
          const delayEnd = new Date(
            delayStart.getTime() + d.delay_minutes * 6e4
          );
          timeline.push({
            type: "delay",
            start: d.created_at,
            end: delayEnd.toISOString(),
            desc: d.delay_reason,
            duration: d.delay_minutes
          });
          details.push({
            time: delayStart.toLocaleTimeString("pl-PL", {
              hour: "2-digit",
              minute: "2-digit"
            }),
            desc: `Przest\xF3j: ${d.delay_reason}`,
            duration: d.delay_minutes,
            type: "delay"
          });
        });
      } else {
        const date = t.scheduled_date;
        const existingBar = timeline.find((x) => x.date === date);
        if (existingBar) {
          existingBar.minutes += Math.round(duration);
          existingBar.percent = Math.min(
            100,
            Math.round(existingBar.minutes / 480 * 100)
          );
        } else {
          timeline.push({
            type: "bar",
            date,
            minutes: Math.round(duration),
            percent: Math.min(100, Math.round(duration / 480 * 100))
          });
        }
      }
      workMinutes += duration;
    });
    delays.results.forEach((d) => delayMinutes += d.delay_minutes || 0);
    let targetMinutes = 0;
    if (isSingleDay) {
      const [startH, startM] = (driver.work_start || "07:00").split(":");
      const [endH, endM] = (driver.work_end || "15:00").split(":");
      targetMinutes = Math.max(
        0,
        parseInt(endH) * 60 + parseInt(endM) - (parseInt(startH) * 60 + parseInt(startM)) - 20
      );
    } else {
      const activeDays = new Set(tasks.results.map((t) => t.scheduled_date)).size;
      targetMinutes = activeDays * (480 - 20);
    }
    const realWorkMinutes = Math.max(0, workMinutes - delayMinutes);
    const efficiency = targetMinutes > 0 ? Math.min(100, Math.round(realWorkMinutes / targetMinutes * 100)) : 0;
    driversStats.push({
      id: driver.id,
      name: driver.name,
      tasksCount: tasks.results.length,
      workTime: Math.round(realWorkMinutes),
      delayTime: Math.round(delayMinutes),
      kpi: efficiency,
      isSingleDay,
      timeline,
      details: details.sort((a, b) => a.time.localeCompare(b.time))
    });
  }
  driversStats.sort((a, b) => b.kpi - a.kpi);
  return new Response(JSON.stringify({ drivers: driversStats }), {
    headers: corsHeaders
  });
}
__name(getReports, "getReports");
async function notifyUsers(userIds, type, title2, message, taskId, origin, env2) {
  if (!userIds || userIds.length === 0) return;
  const ids = Array.isArray(userIds) ? userIds : userIds instanceof Set ? Array.from(userIds) : [userIds];
  console.log(`\u{1F4E4} notifyUsers called for users: [${ids.join(", ")}]`);
  for (const userId of ids) {
    try {
      await env2.DB.prepare(
        "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
      ).bind(userId, type, title2, message, taskId || null).run();
      console.log(`\u2705 DB notification inserted for user ${userId}`);
    } catch (e) {
      console.error(`\u274C DB Notification error for user ${userId}:`, e);
    }
  }
  await sendOneSignalNotification(ids, title2, message, { taskId }, origin, env2);
}
__name(notifyUsers, "notifyUsers");
async function sendOneSignalNotification(targetIds, title2, message, data, origin, env2) {
  if (!env2.ONESIGNAL_APP_ID || !env2.ONESIGNAL_API_KEY) {
    console.warn("\u26A0\uFE0F OneSignal credentials missing");
    return;
  }
  const payload = {
    app_id: env2.ONESIGNAL_APP_ID,
    include_external_user_ids: targetIds.map((id) => String(id)),
    headings: { en: title2, pl: title2 },
    contents: { en: message, pl: message },
    data,
    url: `${origin}/?taskId=${data.taskId}`,
    web_url: `${origin}/?taskId=${data.taskId}`,
    // ❌ USUŃ TO (lub utwórz kanał w OneSignal Dashboard):
    // android_channel_id: "transport_tracker_main",
    // ✅ Użyj domyślnego kanału:
    priority: 10,
    ttl: 86400,
    // 24h
    // Chrome na Android
    chrome_web_icon: `${origin}/icon.png`,
    chrome_web_badge: `${origin}/badge.png`,
    chrome_web_image: `${origin}/icon.png`
  };
  try {
    const resp = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${env2.ONESIGNAL_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const responseJson = await resp.json();
    console.log(`\u{1F4E4} OneSignal Response:`, JSON.stringify(responseJson, null, 2));
    if (responseJson.errors) {
      console.error("\u274C OneSignal API Errors:", responseJson.errors);
    }
    return responseJson;
  } catch (e) {
    console.error("\u274C OneSignal error:", e);
  }
}
__name(sendOneSignalNotification, "sendOneSignalNotification");
var worker_default = {
  // Obsługa requestów HTTP
  async fetch(request, env2, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json"
    };
    if (request.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });
    try {
      if (path.startsWith("/api/"))
        return await handleAPI(request, env2, path, corsHeaders);
      return env2.ASSETS.fetch(request);
    } catch (error3) {
      console.error("Worker error:", error3);
      return new Response(
        JSON.stringify({ error: error3.message || "Internal Server Error" }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
  // Cron job - automatyczne czyszczenie (codziennie o 3:00)
  async scheduled(event, env2, ctx) {
    console.log("\u{1F9F9} Cron: Cleaning old data...");
    const sessions = await env2.DB.prepare(
      `
            DELETE FROM sessions WHERE expires_at < datetime('now')
        `
    ).run();
    console.log(`\u{1F9F9} Deleted ${sessions.meta.changes} expired sessions`);
    const attempts = await env2.DB.prepare(
      `
            DELETE FROM login_attempts WHERE updated_at < datetime('now', '-1 day')
        `
    ).run();
    console.log(`\u{1F9F9} Deleted ${attempts.meta.changes} old login attempts`);
    console.log("\u{1F9F9} Cron completed!");
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
