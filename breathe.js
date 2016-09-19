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
	var breathe = {};

	var batchTime = 20;

	/**********************
	 * Constants
	 **********************/
	var STOP_MESSAGE = 'Stopped';
	breathe.STOP_MESSAGE = STOP_MESSAGE;

	/**********************
	 * Utility Functions
	 **********************/
	var timer = (typeof performance !== 'undefined' && performance.now ? performance : { 
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

	/**********************
	* Main loop
	***********************/
	var workQueue = [];
	// TODO: because promises don't resolve synchronously, they only get 
	//       executed once per work cycle. Maybe have a pending promises to 
	//       know when to exit the loop early?
	// TODO: implement a way to synchronously call doSomeWork(), while still 
	//       respecting execution times and timeouts
	// TODO: can add performance tracking if work is tagged with an id
	var doSomeWork = function() {
		var start = timer.now();
		var ind = 0;
		while (ind < workQueue.length && timer.now() - start < batchTime) {
			workQueue[ind]();
			ind++;
		}
		if(workQueue.length){
			workQueue.splice(0, ind);
		}
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
		var _promise = Promise.resolve(init);
		var ret = {
			then: function (o,e) {
				_promise = _promise.then(o, e);
				return ret;
			}
		};
		ret['catch'] = function (e) { 
			// ret['catch'] is used instead of ret.catch, for IE <9 compatibility (with Promise polyfills)
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
	var pauseablePromise = function (init) {
		var _promise = Promise.resolve(init);
		var _paused = false;
		var pauseGate = null;
		var _stopped = false;
		var pauseCallGate = null;
		var stopCallGate = null;
		var forceQueue = false;
		var defaultStop = function () {
			_stopped = true;
			if (_paused && pauseGate) {
				pauseGate.reject(STOP_MESSAGE);
				return Promise.resolve();
			}
			stopCallGate = breatheGate();
			return stopCallGate;
		};
		var defaultPause = function () {
			_paused = true;
			pauseCallGate = breatheGate();
			return pauseCallGate;
		};
		var defaultUnpause = function () {
			_paused = false;
			if(pauseGate){
				pauseGate.resolve();
				pauseGate = null;
			}
			return Promise.resolve(true);
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
				_promise = _promise.then(function (obj) {
					if (_stopped) {
						if (stopCallGate) {
							stopCallGate.resolve();
							stopCallGate = null;
						}
						return Promise.reject(STOP_MESSAGE);
					}
					if (_paused) {
						if (pauseCallGate) {
							pauseCallGate.resolve();
							pauseCallGate = null;
						}
						pauseGate = breatheGate();
						return pauseGate.then(function () {
							var a = o(obj);
							setMethods(a);
							return a;
						});
					} else {
						if (forceQueue) {
							return new Promise(function (resolve, reject) {
								workQueue.push(function () {
									try {
										var a = o(obj);
										setMethods(a);
										resolve(a);
									} catch (e) {
										reject(e);
									}
								});							
							})
						} else {
							var a = o(obj);
							setMethods(a);
							return a;								
						}
					}
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
			return o;
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
		var ret = basicPromise(new Promise(function (resolve, reject) {
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
			var b = initVal;		// value to pass to the loop body and the value returned from the body
			var stopped = false; // for stoppable loops
			var paused = false;
			var finished = false;
			var pauseGate = null;
			var pauseCallGate = null;
			var stopCallGate = null;
			var cancelID = null;
//			var timeout = config.timeoutMode || breathe.requestAnimationFrame();
			return breathe.promise(new Promise(function (resolve, reject) {
				var work = function () {
					if (stopCallGate) {
						reject(STOP_MESSAGE);
						stopCallGate.resolve();
						stopCallGate = null;
						stopped = true;
						finished = true;
						return;
					}
					if (pauseCallGate) {
						pauseGate = breatheGate().then(function () {
							pauseGate = null;
							workQueue.push(work);
						}, function (e) {
							reject(e);
						});
						pauseCallGate.resolve();
						pauseCallGate = null;
						paused = true;
						return;
					}
					try {
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
								workQueue.push(work);
							}, function (e) {
								finished = true;
								reject(e); // pass the error up the chain
							});
							return;
						} else {
							workQueue.push(work);
						}
					} catch (e) {
						reject(e);
					}
				}
				workQueue.push(work);
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
					return Promise.resolve();
				}
				stopCallGate = breatheGate();
				return ret || stopCallGate;
			}).addMethod('pause', function () {
				if (b && b.then && b.pause) {
					return b.pause();
				} else {
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
					return Promise.resolve();
				}
			});
		};
	};

	breathe.promise.timeout = function (timeout) {
		timeout = timeout || 0;
		return function(arg){
			return new Promise(function (resolve, reject) {
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

		return function (init) {
			var i = 0;
			var end = breathe.resolveValue(iterations);
			return whileLoop(copyObj({
				condition: function () {
					return i < end;
				},
				body: function (pass) {
					return body(i++, pass);
				}
			}, c))(init);
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
