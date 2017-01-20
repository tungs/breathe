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
		version: '0.1.7-0.3.0'
	};

	var batchTime = 20;

	/**********************
	 * Constants
	 **********************/
	var STOP_MESSAGE = 'Stopped';
	breathe.STOP_MESSAGE = STOP_MESSAGE;
	var STATE_STARTING = 1;
	var STATE_RUNNING = 2;
	var STATE_PAUSING = 3;
	var STATE_PAUSED = 4;
	var STATE_UNPAUSING = 5;
	var STATE_STOPPING = 6;
	var STATE_STOPPED = 7;
	var STATE_FINISHED = 7;

			// [starting,] running, pausing, paused, unpausing,
			// stopping, stopped, and finished

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

	var queueWork = function (work) {
		var warmup = function () {
			workQueue.push({work: work, cooldown: cooldown});
		};
		var cooldown = function () {
			preWorkQueue.push(warmup);
		};
		warmup();
	};

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
		var _state = STATE_STARTING;
		var _promise = ImmediatePromise.resolve(init);
		var pauseGate = null;
		var _currObj;
		var pauseCallGate = null;
		var stopCallGate = null;
		var _pauser;

		var defaultPause = function () {
			if (_state === STATE_PAUSED) {
				return ImmediatePromise.resolve();
			}
			if(_state === STATE_PAUSING) {
				return pauseCallGate;
			}
			_state = STATE_PAUSING;

			if(_currObj && _currObj.then && _currObj.pause) {
				_pauser = _currObj;
				pauseCallGate = _pauser.pause();
				if (pauseCallGate && pauseCallGate.then) {
					pauseCallGate = pauseCallGate.then(function(){
						_state = STATE_PAUSED;
					});
				} else {
					pauseCallGate = null;
				}
				return pauseCallGate;
			}
			// Add another event to the promise chain to trigger pauseCallGate,
			// in case if the promise chain is at the end
			// TODO: Check if this is necessary.
			pauseCallGate = breatheGate();
			ret.then(promisePass); 
			return pauseCallGate;
		};
		var defaultUnpause = function () {
			var gate;
			_state = STATE_RUNNING;
			// TODO: look into why it seems this needs to be called if
			// _pauser.unpause is called (there shouldn't be a pause gate?)			
			if(pauseGate){
				gate = pauseGate;
				pauseGate = null;
				gate.resolve();
			}
			if(_pauser) {
				gate = _pauser.unpause();
				_pauser = null;
				return gate;
			}
			return ImmediatePromise.resolve(true);
		};

		var defaultStop = function () {
			if (_state === STATE_STOPPED) {
				return ImmediatePromise.resolve(true);
			}
			if(_currObj && _currObj.then && _currObj.stop) {
				_state = STATE_STOPPING;
				stopCallGate = _currObj.stop();
				if (stopCallGate && stopCallGate.then) {
					stopCallGate = stopCallGate.then(function(){
						// TODO: check if this is necessary, 
						// since it'll be handled in handleGates
						_state = STATE_STOPPED;
					});
				} else {
					stopCallGate = ImmediatePromise.resolve(true);
				}
				return stopCallGate;
			}
			if (_state === STATE_PAUSED && pauseGate) {
				_state = STATE_STOPPED;
				pauseGate.reject(STOP_MESSAGE);
				return ImmediatePromise.resolve();
			} else if (_state === STATE_PAUSING && pauseCallGate) {
				_state = STATE_STOPPING;
				return pauseCallGate.then(function() {
					if (pauseGate) {
						pauseGate.reject(STOP_MESSAGE);
					}
					_state = STATE_STOPPED;
				});
			} else {
				_state = STATE_STOPPING;
			}
			// Add another event to the promise chain to trigger stopCallGate,
			// in case if the promise chain is at the end.
			// TODO: Check if this is necessary.
			stopCallGate = breatheGate();
			ret.then(promisePass);
			return stopCallGate;
		};

		var handleGates = function (obj) {
			var gate;
			if (_state === STATE_STOPPING) {
				if (stopCallGate) {
					stopCallGate.resolve();
					stopCallGate = null;
				}
				_state = STATE_STOPPED;
				return ImmediatePromise.reject(STOP_MESSAGE);				
			} else if (_state === STATE_STOPPED) {
				return ImmediatePromise.reject(STOP_MESSAGE);				
			} else if (_state === STATE_PAUSING) {
				if (pauseCallGate) {
					gate = pauseCallGate;
					pauseCallGate = null;
					gate.resolve();
				}
				_state = STATE_PAUSED;
				pauseGate = breatheGate();
				return pauseGate.then(function () {
					_state = STATE_RUNNING;
					return obj;
				});
			} else if (_state === STATE_PAUSED) {
				return pauseGate;
			}
			return obj;
		};

		_promise = _promise.then(function(obj) {
			return new ImmediatePromise(function (resolve, reject) {
				queueWork(function (){
					resolve(obj);
				});
			}).then(handleGates);
		});

		var ret = {
			resetMethods: function () {
				// in case if the methods get ovewritten
				ret.pause = defaultPause;
				ret.unpause = defaultUnpause;
				ret.stop = defaultStop
			},
			pause: defaultPause,
			unpause: defaultUnpause,
			stop: defaultStop,
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
								ImmediatePromise.resolve().then(handleGates)
								  .then(function () {
										try {
											_currObj = o(obj);
											resolve(_currObj);
										} catch (e) {
											reject(e);
										}
								  }).then(handleGates);
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
					}, e || null).then(handleGates);
				return ret;
			}
		};
		ret['catch'] = function (e) {
			// ret['catch'] is used instead of ret.catch, for IE <9 
			// compatibility (with Promise polyfills)
			_promise.then(null, e);
			return ret;
		};
		_state = STATE_RUNNING;
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
			var target = config.chunkTime || 20;
			var chunkTimeout = config.chunkTimeout || 0;
			// value to pass to the loop body and the value returned from the body
			var b = initVal;
			var _state;
			var pauseGate = null;
			var pauseCallGate = null;
			var stopCallGate = null;
			var cancelID = null;
			var batchIteration = 0;
			var throttle = (config && config.throttle ? config.throttle : 0);
			var retLoop = breathe.promise(new ImmediatePromise(function (resolve, reject) {
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
						_state = STATE_STOPPED;
						reject(STOP_MESSAGE);
						stopCallGate.resolve();
						stopCallGate = null;
						return;
					}
					if (pauseCallGate) {
						_state = STATE_PAUSED;
						pauseGate = breatheGate().then(function () {
							pauseGate = null;
							reenterWork();
						}, function (e) {
							reject(e);							
						});
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
							_state = STATE_FINISHED;
							resolve(b);
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
								reject(e); // pass the error up the chain
							});
							return;
						} else {
							workQueue.push({work: work, cooldown: cooldown});
						}
					} catch (e) {
						reject(e);
					}
				};
				warmup();
			})).addMethod('stop', function () {
				var ret;
				var prevState = _state;
				if(b && b.then && b.stop){
					ret = b.stop();
				} else {
					_state = STATE_STOPPING;
				}					
				if (prevState === STATE_PAUSED && pauseGate) {
					_state = STATE_STOPPED;
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
					_state = STATE_PAUSING;
					if(!pauseCallGate) {
						pauseCallGate = breatheGate();
					}
					return pauseCallGate;
				}
			}).addMethod('unpause', function () {
				if (b && b.then && b.unpause) {
					return b.unpause();
				} else {
					_state = STATE_RUNNING;
					if (pauseGate) {
						pauseGate.resolve();
						pauseGate = null;
					}
					return ImmediatePromise.resolve();
				}
			}).then(function (obj) {
				retLoop.resetMethods();
				return obj;
			});
			return retLoop;
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

	breathe.stop = function (p) {
		return breathe.promise(p && p.then && p.stop);
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
