/* Copyright (c) Steve Tung All Rights Reserved */

(function (root, factory) {
	"use strict";
	var moduleName = 'breathe';
	// TODO: detect node.js/web worker environment and ensure that 
	//       requestAnimationFrame is not used
	if(typeof define === 'function' && define.amd){
		define([], function(){
			return (root[moduleName] = factory(root));
		});
	} else if (typeof module === 'object' && module.exports){
		module.exports = (root[moduleName] = factory(root));
	} else {
		root[moduleName] = factory(root);
	}
}(this, function(exports){
	"use strict";

	// defining ImmediatePromise
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
			if(that.state !== promiseStates.pending) {
				return;
			}
			that.state = promiseStates.resolved;
			that._value = value;
			that._runFn(function () {
				that._clearResolvedQueue();
			});
		};
		
		this.reject = function (reason) {
			if(that.state !== promiseStates.pending) {
				return;
			}
			that.state = promiseStates.rejected;
			that._reason = reason;
			that._runFn(function () {
				that._clearRejectedQueue();
			});
		};
		
		fn.call(this, this.resolve, this.reject);
	};


	var _resolveValueOrPromise = function (that, d, resolve, reject){
		var then;
		var thenableCalled = false;
		try {
			if(d===that){
				reject(new TypeError("Recursive Promise Detected"));
				return;
			}
			then = d && d.then;
			if( (isObject(d) || isFunction(d)) && isFunction(then)) {
				then.call(d, function(val){
					if(thenableCalled) {
						return;
					}
					if(d===val){
						reject(new TypeError("Recursive Promise Detected"));
						return;
					}
					thenableCalled = true;
					_resolveValueOrPromise(that, val, resolve, reject);
				}, function(reason){
					if(thenableCalled){
						return;
					}
					thenableCalled = true;
					reject(reason);
				});
			} else {
				resolve(d);
			}
		} catch (e) {
			if(!thenableCalled) {
				reject(e);
			}
		}
	};

	ImmediatePromise.prototype = {
		_clearResolvedQueue: function () {
			while (this._pendingThen.length) {
				this._pendingThen.shift()(this._value);
			}
		}, _clearRejectedQueue: function () {
			while (this._pendingCatch.length){
				this._pendingCatch.shift()(this._reason);
			}
		}, _runFn: function(fn){
			if (this.immediate) {
				fn();
			} else {
				setTimeout(fn, 0);
			}
		}, then: function (onResolved, onRejected) {
			var that = this;
			var p = {};
			p = new ImmediatePromise(function(resolve, reject){
				var resolveValue = (that.state === promiseStates.rejected) ? null : 
				function(value){						
					if(isFunction(onResolved)){
						try {
							_resolveValueOrPromise(p, onResolved(value), resolve, reject);
						} catch (e) {
							reject (e);
						}
					} else {
						resolve(value);
					}
				};

				var catchReason = (that.state === promiseStates.resolved) ? null : 
				function(reason){
					if(isFunction(onRejected)){
						try {
							_resolveValueOrPromise(p, onRejected(reason), resolve, reject);
						} catch (e) {
							reject (e);
						}
					} else {
						reject(reason);
					}
				};
				
				that._pendingThen.push(resolveValue);
				that._pendingCatch.push(catchReason);
				if (that.state === promiseStates.resolved) {
					that._runFn(function(){
						that._clearResolvedQueue();
					})
				} else if (that.state === promiseStates.rejected) {
					that._runFn(function(){
						that._clearRejectedQueue();
					})
				}
			});
			return p;
		}, 'catch': function (onRejected) {
			this.then(null, onRejected);
		}
	}	
	ImmediatePromise.resolve = function(d) {
		var p = new ImmediatePromise(function(resolve, reject){
			_resolveValueOrPromise({}, d, resolve, reject);
		});
		return p;
	};
	
	ImmediatePromise.reject = function(e){
		return new ImmediatePromise(function(resolve, reject){
			reject(e);
		});
	};

	ImmediatePromise.runImmediately = true;
	
	ImmediatePromise.states = promiseStates;

	ImmediatePromise.version = '0.1.0';

	// defining breathe

	var breathe = {
		version: '0.1.7-0.1.0'
	};

	var batchTime = 20;

	/**********************
	 * Constants
	 **********************/
	var STOP_MESSAGE = 'Stopped';
	breathe.STOP_MESSAGE = STOP_MESSAGE;

	/**********************
	 * Utility Functions
	 **********************/
	var timer = (typeof performance !== 'undefined' && performance.now ? 
	performance : { 
		now: function () {
			return new Date().getTime();
		}
	});
	
	var resolveValue = function (v) {
		return (typeof v === 'function' ? v() : v);
	};
	breathe.resolveValue = resolveValue;
	
	var unwrap = function (fn) {
		return function () {
			return fn.apply(this, arguments)();
		};
	};

	var copyObj = function (from, to) {
		var key;
		for (key in from) {
			if (from.hasOwnProperty(key)) {
				to[key] = from[key];
			}
		}
		return to;
	};

	var promisePass = function(a){
		return a;
	};

	/**********************
	* Main loop
	***********************/
	var preWorkQueue = [];
	var workQueue = [];
	var postWorkQueue = [];
	// TODO: can add performance tracking if work is tagged with an id
	var doSomeWork = function() {
		var start = timer.now();
		var ind;

		// preWorkQueue is work that is always executed before a batch of work
		// usually adds work to the workQueue and calls event handlers
		for (ind = 0; ind < preWorkQueue.length; ind++) {
			preWorkQueue[ind]();
		}
		preWorkQueue = [];

		// The workQueue is the main queue for running work. It sustains a loop by
		// the .work() function adding more items to the workQueue
		for (ind = 0; ind < workQueue.length 
			&& timer.now() - start < batchTime; ind++) {
			workQueue[ind].work();
		}

		// If a queue is not completed within a batch, run .cooldown() for the 
		// remaining items. It usually adds work to the preWorkQueue 
		// and calls event handlers.
		for (ind = ind; ind<workQueue.length; ind++) {
			workQueue[ind].cooldown();
		}
		workQueue = [];


		for (ind = 0; ind<postWorkQueue.length; ind++) {
			postWorkQueue[ind]();
		}
		postWorkQueue = [];

		// TODO: check actual execution time, maybe adjust timeout to reflect
		// excessively long jobs?
		setTimeout(doSomeWork, 0);
	};
	doSomeWork();

	breathe.setBatchTime = function(time){
		batchTime = time;
		return breathe;
	};
	
	/**********************
	 * Classes
	 **********************/


	// basicPromise is promise-like, by implementing then and catch, but it 
	// returns itself when invoking those functions instead of a new Promise. 
	// This preserves methods attached to the object (like .resolve() and 
	//.release() in breatheGate) when creating a chain.
	var basicPromise = function (init) {
		var _promise = ImmediatePromise.resolve(init);
		var ret = {
			then: function (o,e) {
				_promise = _promise.then(o, e);
				return ret;
			}
		};
		ret['catch'] = function (e) { 
			// ret['catch'] is used instead of ret.catch, 
			// for IE <9 compatibility (with Promise polyfills)
			_promise = _promise.then(null, e);
			return ret;
		};
		return ret;
	};

	// pauseablePromise is like basicPromise, except it has a few built in 
	// methods for adding new methods and stopping, pausing, and unpausing 
	// promise chains. Additionally, the .then() function adds checks for 
	// stopping and pausing. It then overwrites .stop(), .pause(), and 
	// .unpause() if they're implemented by a returned promise.
	var pauseablePromise = function (init, config) {
		config = config || {};
		var _promise = ImmediatePromise.resolve(init);
		var _paused = false;
		var pauseGate = null;
		var _stopped = false;
		var pauseCallGate = null;
		var stopCallGate = null;
		var defaultStop = function () {
			_stopped = true;
			if (_paused && pauseGate) {
				pauseGate.reject(STOP_MESSAGE);
				return ImmediatePromise.resolve();
			}
			// add another event to the promise chain to trigger stopCallGate,
			// in case if the promise chain is at the end
			stopCallGate = breatheGate();
			ret.then(promisePass);
			return stopCallGate;
		};
		var defaultPause = function () {
			if(_paused) {
				return pauseCallGate;
			}
			_paused = true;
			// add another event to the promise chain to trigger pauseCallGate,
			// in case if the promise chain is at the end
			pauseCallGate = breatheGate();
			ret.then(promisePass); 
			return pauseCallGate;
		};
		var defaultUnpause = function () {
			_paused = false;
			if(pauseGate){
				pauseGate.resolve();
				pauseGate = null;
			}
			return ImmediatePromise.resolve(true);
		};
		var handleGates = function (obj) {
			if (_stopped) {
				if (stopCallGate) {
					stopCallGate.resolve();
					stopCallGate = null;
				}
				return ImmediatePromise.reject(STOP_MESSAGE);
			}
			if (_paused) {
				if (pauseCallGate) {
					pauseCallGate.resolve();
					pauseCallGate = null;
				}
				pauseGate = breatheGate();
				return pauseGate.then(function () {
					return obj;
				});
			}
			return obj;
		};
		var ret = {
			addMethod: function (name, fn) {
				ret[name] = fn;
				return ret;
			},
			addMethods: function (objs) {
				copyObj(objs, ret);
				return ret;
			},
			then: function (o, e) {
				if (!o) {
					return ret['catch'](e);
				}
				_promise = _promise.then(handleGates)
					.then(function (obj) {
						return new ImmediatePromise(function (resolve, reject) {
							var work = function () {
								try {
									var a = o(obj);
									setMethods(a);
									resolve(a);
								} catch (e) {
									reject(e);
								}
							};
							var warmup = function() {
								workQueue.push({work: work, cooldown: cooldown});
								if (config.onBeginBatch) {
									config.onBeginBatch();
								}
							};
							var cooldown = function() {
								preWorkQueue.push(warmup);
								if (config.onEndBatch) {
									config.onEndBatch();
								}
							};
							workQueue.push({work: work, cooldown: cooldown});
						});
					}, e || null);
				return ret;
			}
		};
		ret['catch'] = function (e) {
			// ret['catch'] is used instead of ret.catch, for IE <9 
			// compatibility (with Promise polyfills)
			_promise.then(null, e);
			return ret;
		};
		var setMethods = function (o) {
			if(o && o.then){
				// o is a promise
				ret.stop = o.stop || defaultStop;
				ret.pause = o.pause || defaultPause;
				ret.unpause = o.unpause || defaultUnpause;
			} else {
				ret.stop = defaultStop;
				ret.pause = defaultPause;
				ret.unpause = defaultUnpause;
			}
			return ret;
		};
		setMethods();
		return ret;
	};
	breathe.promise = pauseablePromise;

	breathe.start = function (init) {
		return breathe.promise(init);
	};

	breathe.next = {};
	
	// breatheGate is a basicPromise that doesn't resolve or reject until 
	// explicitly called via promiseObj.resolve() or promiseObj.reject(). Used
	// for unpausing and callbacks.
	var breatheGate = function () {
		var resolveCall;
		var rejectCall;
		var ret = basicPromise(new ImmediatePromise(function (resolve, reject) {
			resolveCall = resolve;
			rejectCall = reject;
		}));
		ret.resolve = resolveCall;
		ret.reject = rejectCall;
		return ret;
	};
	breathe.gate = breatheGate;
	
	breathe.setTimeout = function (t) {
		t = t || 0;
		return {
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
			timeout: function (fn) {
				return requestAnimationFrame(fn);
			},
			cancel: function (a) {
				return cancelAnimationFrame(a);
			}
		};
	};
	copyObj(breathe.requestAnimationFrame(), breathe.requestAnimationFrame);

	var generalLoop = function (config) {
		return function (initVal) {
			var condition = config.condition;
			var body = config.body;
			var ret = config.ret;
			var target = config.chunkTime || 20;
			var chunkTimeout = config.chunkTimeout || 0;
			// value to pass to the loop body and the value returned from the body
			var b = initVal;
			// TODO: since there can't be simultaneous states, may want to define states:
			// [starting,] running, pausing, paused, unpausing,
			// stopping, stopped, and finished
			var stopped = false; // for stoppable loops
			var paused = false;
			var finished = false;
			var pauseGate = null;
			var pauseCallGate = null;
			var stopCallGate = null;
			var cancelID = null;
			var batchIteration = 0;
			var throttle = (config && config.throttle ? config.throttle : 0);
			return breathe.promise(new ImmediatePromise(function (resolve, reject) {
				var warmup = function() {
					workQueue.push({work: work, cooldown: cooldown});
					batchIteration = 0;
					if (config.onBeginBatch) {
						config.onBeginBatch();
					}
				};
				var reenterWork = function() {
					preWorkQueue.push(warmup);
				};
				var cooldown = function() {
					reenterWork();
					if (config.onEndBatch) {
						config.onEndBatch();
					}
				};
				var work = function () {
					if (stopCallGate) {
						reject(STOP_MESSAGE);
						stopped = true;
						stopCallGate.resolve();
						stopCallGate = null;
						finished = true;
						return;
					}
					if (pauseCallGate) {
						pauseGate = breatheGate().then(function () {
							pauseGate = null;
							reenterWork();
						}, function (e) {
							reject(e);							
						});
						paused = true;
						pauseCallGate.resolve();
						pauseCallGate = null;
						return;
					}
					try {
						batchIteration++;
						if (throttle && batchIteration > throttle) {
							postWorkQueue.push(cooldown);
							return;
						}
						if (!condition()) {
							finished = true;
							resolve(ret ? ret() : b);
							return;
						}
						b = body(b); // run body and store the result to b
						if (b && b.then) {
							// if body() returned a promise
							b.then(function (arg) {
								b = arg;
								// can alternatively call reenterWork(), but that skips the current batch
								workQueue.push({work: work, cooldown: cooldown});
							}, function (e) {
								finished = true;
								reject(e); // pass the error up the chain
							});
							return;
						} else {
							workQueue.push({work: work, cooldown: cooldown});
						}
					} catch (e) {
						reject(e);
					}
				}
				warmup();
			})).addMethod('stop', function () {
				var ret;
				if(b && b.then && b.stop){
					ret = b.stop();
				} else {
					stopped = true;
				}
				if (paused && pauseGate) {
					pauseGate.reject(STOP_MESSAGE);
					pauseGate = null;
					if (pauseCallGate) {
						pauseCallGate.resolve();
						pauseCallGate = null;
					}
					return ImmediatePromise.resolve();
				}
				stopCallGate = breatheGate();
				return ret || stopCallGate;
			}).addMethod('pause', function () {
				if (b && b.then && b.pause) {
					return b.pause();
				} else {
					if (paused) {
						return pauseCallGate || ImmediatePromise.resolve();
					}
					if(pauseCallGate) {
						return pauseCallGate;
					}
					paused = true;
					pauseCallGate = breatheGate();
					return pauseCallGate;
				}
			}).addMethod('unpause', function () {
				if (b && b.then && b.unpause) {
					return b.unpause();
				} else {
					paused = false;
					if (pauseGate) {
						pauseGate.resolve();
						pauseGate = null;
					}
					return ImmediatePromise.resolve();
				}
			}).then(function () {
				// use an empty .then to reset pause, unpause, and stop
			});
		};
	};

	breathe.promise.timeout = function (timeout) {
		timeout = timeout || 0;
		return function(arg){
			return new ImmediatePromise(function (resolve, reject) {
				setTimeout(function () {
					resolve(arg);
				}, timeout);
			});
		};
	};
	
	var timesLoop = function (iterations, body, config) {
		if (arguments.length === 1) {
			config = arguments[0];
			iterations = null;
			body = null;
		} else {
			config = config || {};
		}
		body = config.body || body;
		iterations = config.iterations || iterations;
		var c = copyObj(config, {});

		return function (initVal) {
			var i = 0;
			var end = breathe.resolveValue(iterations);
			return whileLoop(copyObj({
				condition: function () {
					return i < end;
				},
				body: function (pass) {
					return body(i++, pass);
				}
			}, c))(initVal);
		};
	};
	breathe.times = unwrap(timesLoop);
	breathe.next.times = timesLoop;

	var whileLoop = function (condition, body, config) {
		if (arguments.length === 1) {
			config = arguments[0];
			body = null;
			condition = null;
		} else {
			config = config || {};
		}
		var c = copyObj(config, {
			body: body,
			condition: condition
		});
		return generalLoop(c);
	};
	breathe.loop = unwrap(whileLoop);
	breathe.next.loop = whileLoop;
	
	return breathe;
}));
