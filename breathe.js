/* Copyright (c) Steve Tung All Rights Reserved */

(function (root, factory) {
  "use strict";
  var moduleName = 'breathe';
  if (typeof define === 'function' && define.amd) {
    define([], function () {
      return (root[moduleName] = factory(root));
    });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = (root[moduleName] = factory(root));
  } else {
    root[moduleName] = factory(root);
  }
}(this, function (exports) {
  "use strict";

  /***************************
   * Begin Immediate Promise
   ***************************/
  var promiseStates = {
    pending: 1,
    resolved: 2,
    rejected: 3
  };
  var isFunction = function (f) {
    return typeof f === 'function';
  };
  var isObject = function (o) {
    return typeof o === 'object';
  };
  var ImmediatePromise = function (fn) {
    var that = this;
    this.state = promiseStates.pending;
    this.immediate = ImmediatePromise.runImmediately;

    this._pendingThen = [];
    this._pendingCatch = [];

    this.resolve = function (value) {
      if (that.state !== promiseStates.pending) {
        return;
      }
      that.state = promiseStates.resolved;
      that._value = value;
      that._runFn(function () {
        that._clearResolvedQueue();
      });
    };

    this.reject = function (reason) {
      if (that.state !== promiseStates.pending) {
        return;
      }
      that.state = promiseStates.rejected;
      that._reason = reason;
      if (!that._pendingCatch.length && ImmediatePromise.loggingErrors) {
        that._loggingErrorTimeout = setTimeout(function () {
          console.warn(that._reason);
        }, ImmediatePromise.loggingErrorTimeout);
      }
      that._runFn(function () {
        that._clearRejectedQueue();
      });
    };

    fn.call(this, this.resolve, this.reject);
  };


  var _resolveValueOrPromise = function (that, d, resolve, reject) {
    var then;
    var thenableCalled = false;
    try {
      if (d === that) {
        reject(new TypeError("Recursive Promise Detected"));
        return;
      }
      then = d && d.then;
      if ((isObject(d) || isFunction(d)) && isFunction(then)) {
        then.call(d, function (val) {
          if (thenableCalled) {
            return;
          }
          if (d === val) {
            reject(new TypeError("Recursive Promise Detected"));
            return;
          }
          thenableCalled = true;
          _resolveValueOrPromise(that, val, resolve, reject);
        }, function (reason) {
          if (thenableCalled) {
            return;
          }
          thenableCalled = true;
          reject(reason);
        });
      } else {
        resolve(d);
      }
    } catch (e) {
      if (!thenableCalled) {
        reject(e);
      }
    }
  };

  ImmediatePromise.prototype = {
    _clearResolvedQueue: function () {
      while (this._pendingThen.length) {
        this._pendingThen.shift()(this._value);
      }
    },
    _clearRejectedQueue: function () {
      while (this._pendingCatch.length) {
        this._pendingCatch.shift()(this._reason);
      }
    },
    _runFn: function (fn) {
      if (this.immediate) {
        fn();
      } else {
        setTimeout(fn, 0);
      }
    },
    then: function (onResolved, onRejected) {
      var that = this;
      var p = {};
      p = new ImmediatePromise(function (resolve, reject) {
        var resolveValue = (that.state === promiseStates.rejected) ? null : function (value) {
          if (isFunction(onResolved)) {
            try {
              _resolveValueOrPromise(p, onResolved(value), resolve, reject);
            } catch (e) {
              reject(e);
            }
          } else {
            resolve(value);
          }
        };

        var catchReason = (that.state === promiseStates.resolved) ? null : function (reason) {
          if (isFunction(onRejected)) {
            try {
              _resolveValueOrPromise(p, onRejected(reason), resolve, reject);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(reason);
          }
        };

        that._pendingThen.push(resolveValue);
        that._pendingCatch.push(catchReason);
        clearTimeout(that._loggingErrorTimeout);
        if (that.state === promiseStates.resolved) {
          that._runFn(function () {
            that._clearResolvedQueue();
          });
        } else if (that.state === promiseStates.rejected) {
          that._runFn(function () {
            that._clearRejectedQueue();
          });
        }
      });
      return p;
    },
    'catch': function (onRejected) {
      this.then(null, onRejected);
    }
  };

  ImmediatePromise.resolve = function (d) {
    var p = new ImmediatePromise(function (resolve, reject) {
      _resolveValueOrPromise({}, d, resolve, reject);
    });
    return p;
  };

  ImmediatePromise.reject = function (e) {
    return new ImmediatePromise(function (resolve, reject) {
      reject(e);
    });
  };

  ImmediatePromise.version = '0.1.1';

  ImmediatePromise.loggingErrors = true;
  ImmediatePromise.loggingErrorTimeout = 3000;
  ImmediatePromise.runImmediately = true;

  ImmediatePromise.states = promiseStates;

  /**********************
   *
   *  Begin breathe
   *
   **********************/

  var breathe = {
    version: '0.2.1'
  };

  /**********************
   * CONSTANTS
   **********************/
  var DEFAULT_BATCH_TIME = 17;
  var GENERAL_WORK_ID = -1;

  var STOP_MESSAGE = 'Stopped';
  breathe.STOP_MESSAGE = STOP_MESSAGE;

  var STATE_STARTING = 1;
  var STATE_RUNNING = 2;
  var STATE_PAUSING = 3;
  var STATE_PAUSED = 4;
  var STATE_UNPAUSING = 5;
  // There is no STATE_UNPAUSED, just STATE_RUNNING
  var STATE_STOPPING = 7;
  var STATE_STOPPED = 8;
  var STATE_FINISHED = 9;

  /**********************
   * Private Variables 
   * (used throughout)
   **********************/

  var _batchTime = DEFAULT_BATCH_TIME;
  var _newWorkId = 2;
  var _currWorkId;
  var _inMainLoop = false;


  /**********************
   * Utility functions
   **********************/

  var timer = (typeof performance !== 'undefined' && performance.now ?
    performance : {
      now: function () {
        return new Date().getTime();
      }
    });

  var copyObj = function (from, to) {
    var key;
    if (from) {
      for (key in from) {
        if (from.hasOwnProperty(key)) {
          to[key] = from[key];
        }
      }
    }
    return to;
  };

  var breatheGate = function () {
    // this takes advantage that .resolve() and .reject() are exposed
    // in ImmediatePromise
    return new ImmediatePromise(emptyFn);
  };

  breathe.getBatchTime = function (time) {
    return _batchTime;
  };

  breathe.setBatchTime = function (time) {
    _batchTime = time;
    return breathe;
  };

  breathe.getCurrWorkId = function () {
    return _currWorkId;
  };

  var isThenable = function (t) {
    return t && typeof t.then === 'function';
  };

  var uniqueId = function () {
    return _newWorkId++;
  };
  breathe.uniqueId = uniqueId;

  var emptyFn = function () {};

  var passFn = function (o) {
    return o;
  };

  var resolveFunction = function (o) {
    return typeof o === 'function' ? resolveFunction(o()) : o;
  };

  breathe.setTimeout = function (t) {
    t = t || 0;
    return {
      prework: null,
      postwork: function (fn) {
        return setTimeout(fn, t);
      },
      timeout: function (fn) {
        return setTimeout(fn, t);
      },
      cancel: function (a) {
        return clearTimeout(a);
      }
    };
  };
  copyObj(breathe.setTimeout(), breathe.setTimeout);

  breathe.requestAnimationFrame = function () {
    return {
      prework: function (fn) {
        return requestAnimationFrame(fn);
      },
      postwork: null,
      timeout: function (fn) {
        return requestAnimationFrame(fn);
      },
      cancel: function (a) {
        return cancelAnimationFrame(a);
      }
    };
  };
  copyObj(breathe.requestAnimationFrame(), breathe.requestAnimationFrame);

  var _workTimeouter = breathe.setTimeout;
  var _workTimeoutRef;

  var switchTimeouter = function (timeouter, batchTime) {
    _workTimeouter.cancel(_workTimeoutRef);
    _workTimeouter = timeouter;
    if (batchTime !== undefined) {
      breathe.setBatchTime(batchTime);
    }
    if (!_inMainLoop || !_workTimeouter.postwork) {
      _workTimeouter.timeout(doSomeWork);
    }
  };

  breathe.animationMode = function () {
    return switchTimeouter(breathe.requestAnimationFrame, 12);
  };

  breathe.timeoutMode = function () {
    return switchTimeouter(breathe.setTimeout, DEFAULT_BATCH_TIME);
  };

  var _throttling = {};
  var breatheThrottle = function (id, amount) {
    _throttling[id] = amount;
  };

  breathe.throttle = function (id, amount) {
    if (id && id.getWorkId()) {
      breathe.throttle(id.getWorkId(), amount);
    } else {
      breatheThrottle(id, amount);
    }
  };

  var customHandlers = {};
  breathe.on = function (type, fn) {
    customHandlers[type] = customHandlers[type] || [];
    customHandlers[type].push(fn);
  };
  var trigger = function (type, data) {
    var i;
    var handlers = customHandlers[type];
    if (!handlers) {
      return;
    }
    for (i=0; i < handlers.length; i++) {
      if (data) {
        handlers[i].apply(this, data);
      } else {
        handlers[i]();
      }
    }
  };

  /**********************
   * Main loop
   **********************/
  var _preWorkQueue = [];
  var _workQueue = [];
  var _postWorkQueue = [];
  /** 
   * One iteration of the main loop 
   */
  var doSomeWork = function () {
    var start = timer.now();
    var ind;
    var id;
    var throttleCount = {};
    _inMainLoop = true;
    trigger('batchBegin');
    if (_workTimeouter.prework) {
      _workTimeoutRef = _workTimeouter.prework(doSomeWork);
    }

    // preWorkQueue is work that is always executed before a batch of work
    // usually adds work to the workQueue and calls event handlers
    for (ind = 0; ind < _preWorkQueue.length; ind++) {
      _currWorkId = _preWorkQueue[ind].id;
      _preWorkQueue[ind].warmup();
    }
    _preWorkQueue = [];

    // The workQueue is the main queue for running work. It sustains a loop by
    // the .work() function adding more items to the workQueue
    for (ind = 0; ind < _workQueue.length &&
      timer.now() - start < _batchTime; ind++) {
      id = _workQueue[ind].id;
      _currWorkId = id;
      if (_throttling[id]) {
        throttleCount[id] = (throttleCount[id] || 0) + 1;
        if (throttleCount[id] > _throttling[id]) {
          _workQueue[ind].cooldown();
        } else {
          _workQueue[ind].work();
        }
      } else {
        _workQueue[ind].work();
      }
    }

    // If a queue is not completed within a batch, run .cooldown() for the 
    // remaining items. It usually adds work to the preWorkQueue 
    // and calls event handlers.
    for (ind = ind; ind < _workQueue.length; ind++) {
      _currWorkId = _workQueue[ind].id;
      _workQueue[ind].cooldown();
    }
    _workQueue = [];

    for (ind = 0; ind < _postWorkQueue.length; ind++) {
      _currWorkId = _postWorkQueue[ind].id;
      _postWorkQueue[ind].cooldown();
    }
    _postWorkQueue = [];
    if (_workTimeouter.postwork) {
      _workTimeoutRef = _workTimeouter.postwork(doSomeWork);
    }
    _currWorkId = GENERAL_WORK_ID;
    trigger('batchEnd');
    _inMainLoop = false;
  };
  // Start the main loop, even though there are no items in any of the queues
  _currWorkId = GENERAL_WORK_ID;
  doSomeWork();

  var addPreWork = function (workObj) {
    _preWorkQueue.push(workObj);
  };

  var addWork = function (workObj) {
    _workQueue.push(workObj);
  };

  var queueWork = function (id, work) {
    var warmup = function () {
      addWork({
        work: work,
        cooldown: cooldown,
        id: id
      });
    };
    var cooldown = function () {
      addPreWork({
        warmup: warmup,
        id: id
      });
    };
    warmup();
  };

  breathe.queue = function (work) {
    queueWork(_currWorkId, work);
    return breathe;
  };

  var fnInContext = function (id, fn) {
    return function () {
      var prevId = _currWorkId;
      _currWorkId = resolveFunction(id);
      var r = fn.apply(this, arguments);
      _currWorkId = prevId;
      return r;
    };
  };

  var StateHandler = function () {
    this.state = STATE_STARTING;
  };

  StateHandler.prototype = {
    pause: function () {
      var that = this;
      if (this.state === STATE_PAUSED) {
        return ImmediatePromise.resolve();
      } else if (this.state === STATE_PAUSING) {
        return this.callGate;
      } else if (this.state === STATE_STOPPING) {
        return ImmediatePromise.reject("Can't Pause. Already Stopping.");
      } else if (this.state === STATE_STOPPED) {
        return ImmediatePromise.reject("Can't Pause. Already Stopped.");
      }
      this.state = STATE_PAUSING;
      var currVal = this.currVal;
      if (currVal && currVal.then && currVal.pause) {
        this.pauser = currVal;
        this.callGate = ImmediatePromise.resolve(currVal.pause())
          .then(function () {
            that.state = STATE_PAUSED;
          });
      } else {
        this.callGate = breatheGate();
      }
      return this.callGate;
    },
    unpause: function () {
      var gate;
      if (this.state === STATE_STOPPING) {
        return ImmediatePromise.reject("Can't Unpause. Already Stopping.");
      } else if (this.state === STATE_STOPPED) {
        return ImmediatePromise.reject("Can't Unpause. Already Stopped.");
      }
      this.state = STATE_RUNNING;
      if (this.pauseGate) {
        gate = this.pauseGate;
        this.pauseGate = null;
        gate.resolve();
      }
      if (this.pauser) {
        gate = this.pauser;
        this.pauser = null;
        return ImmediatePromise.resolve(gate.unpause());
      }
      return ImmediatePromise.resolve();
    },
    stop: function () {
      var that = this;
      var callGate;
      if (this.state === STATE_STOPPED) {
        return ImmediatePromise.resolve();
      }
      if (this.state === STATE_PAUSING) {
        this.callGate.reject("Pausing interrupted by stop.");
      }
      var currVal = this.currVal;
      if (currVal && currVal.then && currVal.stop) {
        this.state = STATE_STOPPING;
        callGate = ImmediatePromise.resolve(currVal.stop())
          .then(function () {
            that.state = STATE_STOPPED;
          });
      }
      if (this.state === STATE_PAUSED && this.pauseGate) {
        this.state = STATE_STOPPED;
        this.pauseGate.reject(STOP_MESSAGE);
        return ImmediatePromise.resolve();
      }
      this.state = STATE_STOPPING;
      this.callGate = callGate || breatheGate();
      return this.callGate;
    },
    gatesPromise: function (val) {
      var gate = this.callGate;
      if (this.state === STATE_RUNNING) {
        return val;
      } else if (this.state === STATE_STOPPING) {
        if (this.callGate) {
          this.callGate = null;
          gate.resolve();
        }
        this.state = STATE_STOPPED;
        return ImmediatePromise.reject(STOP_MESSAGE);
      } else if (this.state === STATE_PAUSING) {
        if (this.callGate) {
          this.callGate = null;
          gate.resolve();
        }
        this.state = STATE_PAUSED;
        this.pauseGate = breatheGate();
        return this.pauseGate;
      } else if (this.state === STATE_STOPPED) {
        return ImmediatePromise.reject(STOP_MESSAGE);
      } else if (this.state === STATE_PAUSED) {
        if (!this.pauseGate) {
          this.pauseGate = breatheGate();
        }
        return this.pauseGate;
      }
      return val;
    }
  };

  var breatheChain = function (init) {
    var endPromise = ImmediatePromise.resolve();
    var id = _currWorkId;
    var currVal;
    var stateHandler = new StateHandler();

    var atEnd = function() {
      return endPromise.state === promiseStates.resolved
        || endPromise.state === promiseStates.rejected;
    };

    var handleGates = function (val) {
      return stateHandler.gatesPromise(val);
    };

    var stateCommandWrapper = function (command) {
      return function () {
        var gate = stateHandler[command]();
        if (atEnd()) {
          endPromise = endPromise.then(handleGates);
        }
        return gate;        
      };
    };

    var ret = {
      throttle: function (amount) {
        breatheThrottle(_id, amount);
      },
      pause: stateCommandWrapper('pause'),
      stop: stateCommandWrapper('stop'),
      unpause: stateCommandWrapper('unpause'),
      atEnd: atEnd,
      then: function (o, e) {
        endPromise = endPromise
          .then(handleGates)
          .then(!o ? null : function (val) {
            return new ImmediatePromise(function (resolve, reject) {
              queueWork(id, function () {
                ImmediatePromise.resolve()
                  .then(handleGates).then(fnInContext(id, function () {
                    try {
                      currVal = o(val);
                      stateHandler.currVal = currVal;
                      resolve(currVal);
                    } catch (e) {
                      reject(e);
                    }
                  }));
              });
            });
          }, e ? fnInContext(id, e) : null)
          .then(handleGates);
        return ret;
      },
      getWorkId: function () {
        return id;
      }
    };
    ret['catch'] = function (e) {
      return ret.then(null, e);
    };
    ret.then(function () {
      stateHandler.state = STATE_RUNNING;
      currVal = typeof init === 'function' ? new ImmediatePromise(init) : init;
      stateHandler.currVal = currVal;
      return currVal;
    });
    return ret;
  };
  breathe.chain = breatheChain;

  var breatheLoop = function (config) {
    var _id = _currWorkId;
    config = config || {};
    var body = config.body;
    var condition = config.condition;
    var currVal = config.initVal;
    var stateHandler = new StateHandler();
    var retLoop = breatheChain(function (resolve, reject) {
      var workBit;
      var preworkBit;
      var work = function () {
        if (stateHandler.state === STATE_PAUSING) {
          stateHandler.state = STATE_PAUSED;
          stateHandler.pauseGate = breatheGate();
          stateHandler.pauseGate.then(function () {
            stateHandler.pauseGate = null;
            warmup();
          });
          stateHandler.callGate.resolve();
          stateHandler.callGate = null;
          return;
        } else if (stateHandler.state === STATE_STOPPING) {
          stateHandler.state = STATE_STOPPED;
          reject(STOP_MESSAGE);
          stateHandler.callGate.resolve();
          stateHandler.callGate = null;
          return;
        }
        try {
          if (!condition()) {
            resolve();
            return;
          }
          currVal = body();
          stateHandler.currVal = currVal;
          if (isThenable(currVal)) {
            currVal.then(function (v) {
              currVal = v;
              stateHandler.currVal = v;
              addWork(workBit);
            }, reject);
          } else {
            addWork(workBit);
          }
        } catch (e) {
          reject(e);
        }
      };
      var warmup = function () {
        if (config.onBatchBegin) {
          config.onBatchBegin();
        }
        addWork(workBit);
      };
      var cooldown = function () {
        if (config.onBatchEnd) {
          config.onBatchEnd();
        }
        addPreWork(preworkBit);
      };
      workBit = {
        work: work,
        cooldown: cooldown,
        id: _id
      };
      preworkBit = {
        warmup: warmup,
        id: _id
      };
      stateHandler.state = STATE_RUNNING;
      warmup();
    });
    retLoop.pause = function () {
      return stateHandler.pause();
    };
    retLoop.unpause = function () {
      return stateHandler.unpause();
    };
    retLoop.stop = function () {
      return stateHandler.stop();
    };
    return breatheChain(retLoop);
  };

  breathe.loop = function (condition, body, config) {
    var loopConfig;
    config = copyObj(config, {});
    if (arguments.length === 1) {
      loopConfig = arguments[0];
    } else {
      loopConfig = copyObj({
        condition: condition,
        body: body
      }, config);
    }
    return breatheLoop(loopConfig);
  };

  var breatheTimesLoop = function (config) {
    var timesConfig = copyObj(config, {});
    var body = config.body;
    var iterations = config.iterations;
    var i = 0;
    timesConfig = copyObj({
      condition: function () {
        return i < iterations;
      },
      body: function (val) {
        return body(i++, val);
      }
    }, timesConfig);
    return breatheLoop(timesConfig);
  };

  breathe.times = function (iterations, body, config) {
    var timesConfig;
    config = copyObj(config, {});
    if (arguments.length === 1) {
      timesConfig = arguments[0];
    } else {
      timesConfig = copyObj({
        iterations: iterations,
        body: body
      }, config);
    }
    return breatheTimesLoop(timesConfig);
  };

  /* experimental functions */

  breathe.stopChain = function (chain) {
    return breathe.chain(chain && chain.stop && chain.stop());
  };

  breathe.pauseChain = function (chain) {
    return breathe.chain(chain && chain.pause && chain.pause());
  };

  breathe.unpauseChain = function (chain) {
    return breathe.chain(chain && chain.unpause && chain.unpause());
  };

  var breatheTag = function (id) {
    if (id === undefined) {
      id = uniqueId();
    }
    var ret = {
      throttle: function (amount) {
        breatheThrottle(id, amount);
        return ret;
      },
      chain: fnInContext(id, breatheChain),
      loop: fnInContext(id, breathe.loop),
      times: fnInContext(id, breathe.times)
    };
    return ret;
  };
  breathe.tag = breatheTag;
  breathe.withId = breatheTag;

  return breathe;
}));