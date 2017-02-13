var assert = require('assert');
var breathe = require('../breathe.js');

var initValue = 'init value';
var testValue = 'test value';
var testErrorMessage = 'test error message';
var testIterations = 11;

var getMilliseconds = function () {
  var hrtime = process.hrtime();
  return hrtime[0] * 1000000 + hrtime[1] / 1000;
};

var delayedPromise = function (timeout, val) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      resolve(val);
    }, timeout);
  });
};

var blockingRecursiveChain = function (remaining, fn) {
  if (fn) {
    fn();
  }
  if (!remaining) {
    return breathe.chain();
  }
  var start = getMilliseconds();
  while (getMilliseconds() - start < 1) {
    // wait
  }
  return breathe.chain().then(function () {
    return blockingRecursiveChain(remaining - 1, fn);
  });
};

var blockingChain = function (time) {
  return breathe.chain(function (resolve, reject) {
    var start = getMilliseconds();
    while (getMilliseconds() - start < time) {
      // wait
    }
    resolve();
  });
};

describe('`breathe`', function () {
  beforeEach(function () {
    breathe.setBatchTime(17);
  });
  describe('`breathe.chain`', function () {

    it('should be able to resolve a value', function () {
      return breathe.chain(testValue).then(function (d) {
        assert.equal(d, testValue);
      });
    });

    it('should be able to resolve a promise', function () {
      return breathe.chain(Promise.resolve(testValue))
        .then(function (d) {
          assert.equal(d, testValue);
        });
    });

    it('should be able to resolve a pending promise', function () {
      return breathe.chain(delayedPromise(10, testValue))
        .then(function (d) {
          assert.equal(d, testValue);
        });
    });

    it('should not immediately resolve', function () {
      var c = initValue;
      var chain = breathe.chain(function (resolve, reject) {
        c = testValue;
        resolve();
      });
      assert.equal(c, initValue);
      return chain;
    });

    describe('`then`', function () {
      it('should be able to resolve a returned value', function () {
        return breathe.chain()
          .then(function () {
            return testValue;
          }).then(function (d) {
            assert.equal(d, testValue);
          });
      });

      it('should be able to resolve a returned promise', function () {
        return breathe.chain().then(function () {
          return Promise.resolve(testValue);
        }).then(function (d) {
          assert.equal(d, testValue);
        });
      });

      it('should be able to resolve a returned pending promise', function () {
        return breathe.chain().then(function () {
          return delayedPromise(10, testValue);
        }).then(function (d) {
          assert.equal(d, testValue);
        });
      });

      it('should be able to resolve a returned `breathe.chain`', function () {
        return breathe.chain().then(function () {
          return breathe.chain(testValue);
        }).then(function (d) {
          assert.equal(d, testValue);
        });
      });

      it('should relinquish the main thread when over batch time', function () {
        breathe.setBatchTime(5);
        var v = initValue;
        var d = blockingRecursiveChain(100);
        setTimeout(function () {
          v = testValue;
        }, 15);
        return d.then(function () {
          assert.equal(v, testValue);
        });
      });

      it('should not relinquish the main thread while under batch time', function () {
        breathe.setBatchTime(500);
        var v = initValue;
        var d = blockingRecursiveChain(100);
        setTimeout(function () {
          v = testValue;
        }, 15);
        return d.then(function () {
          assert.equal(v, initValue);
        });
      });

      it('should be able to catch thrown errors', function () {
        return breathe.chain(Promise.reject(testErrorMessage))
          .then(null, function (err) {
            assert.equal(testErrorMessage, err);
          });
      });

      it('should be able to catch thrown errors and then resolve values', function () {
        return breathe.chain(Promise.reject(testErrorMessage))
          .then(null, function (err) {
            return testValue;
          }).then(function (d) {
            assert.equal(d, testValue);
          });
      });

      it('should not catch errors thrown from the same `then` call', function () {
        var v = initValue;
        return breathe.chain()
          .then(function () {
            throw testErrorMessage;
          }, function (err) {
            assert(testErrorMessage !== err);
          }).then(null, function (err) {
            assert.equal(testErrorMessage, err);
          });
      });
    });


    describe('`catch`', function () {

      it('should be able to catch thrown errors', function () {
        return breathe.chain(Promise.reject(testErrorMessage))
          .catch(function (err) {
            assert.equal(testErrorMessage, err);
          });
      });

      it('should be able to resolve values', function () {
        return breathe.chain(Promise.reject(testErrorMessage))
          .catch(function (err) {
            return testValue;
          }).then(function (d) {
            assert.equal(d, testValue);
          });
      });

    });
  });

  describe('`breathe.loop`', function () {

    it('should repeat the body while the condition is true', function () {
      var i = 0;
      return breathe.loop(function () {
        return i < testIterations;
      }, function () {
        i++;
      }).then(function (d) {
        assert.equal(i, testIterations);
      });
    });

    it('should not immediately run', function () {
      var i, c = initValue;
      var loop = breathe.loop(function () {
        return i < testIterations;
      }, function () {
        i++;
        c = testValue;
      });
      assert.equal(c, initValue);
      return loop;
    });

    it('should wait for a returned promise to resolve before continuing', function () {
      var i = 0;
      var v = initValue;
      var iterations = 4;
      var timeout = 5;
      var t = getMilliseconds();
      return breathe.loop(function () {
        return i < iterations;
      }, function () {
        i++;
        assert.equal(v, initValue);
        v = testValue;
        return delayedPromise(timeout).then(function () {
          v = initValue;
        });
      }).then(function () {
        assert.equal(v, initValue);
        // may want to tweak reasonableTime if setTimeout isn't accurate
        var wiggleRoom = 3 / 4;
        var reasonableTime = (getMilliseconds() - t) > iterations * timeout * wiggleRoom;
        assert(reasonableTime);
      });
    });

    it('should relinquish the main thread when over batch time', function () {
      breathe.setBatchTime(5);
      var v = initValue;
      var i = 0;
      var ret = breathe.loop(function () {
        return i < 100;
      }, function () {
        i++;
        return blockingChain(1);
      });
      setTimeout(function () {
        v = testValue;
      }, 15);
      return ret.then(function () {
        assert.equal(v, testValue);
      });
    });

    it('should not relinquish the main thread while under batch time', function () {
      breathe.setBatchTime(500);
      var v = initValue;
      var i = 0;
      var ret = breathe.loop(function () {
        return i < 100;
      }, function () {
        i++;
        return blockingChain(1);
      });
      setTimeout(function () {
        v = testValue;
      }, 15);
      return ret.then(function () {
        assert.equal(v, initValue);
      });
    });

    it('should be able to throw errors', function () {
      var i = 0;
      return breathe.loop(function () {
        return i < 10;
      }, function () {
        i++;
        if (i === 4) {
          throw testErrorMessage;
        }
      }).then(function () {
        throw new Error('Loop should have thrown an error');
      }, function (err) {
        assert.equal(err, testErrorMessage);
      });
    });

    it('should be able to nest loops', function () {
      var counter = 0;
      var i, j;
      var outerLoopIterations = 6;
      var innerLoopIterations = 7;
      i = 0;
      return breathe.loop(function () {
        return i < outerLoopIterations;
      }, function () {
        i++;
        j = 0;
        return breathe.loop(function () {
          return j < innerLoopIterations;
        }, function () {
          j++;
          counter++;
        });
      }).then(function () {
        assert.equal(counter, outerLoopIterations * innerLoopIterations);
      });
    });

    describe('`then`', function () {

      it('should be able to resolve a value', function () {
        var i = 0;
        return breathe.loop(function () {
          return i < testIterations;
        }, function () {
          i++;
        }).then(function () {
          return i;
        }).then(function (d) {
          assert.equal(d, testIterations);
        });
      });

      it('should be able to resolve a promise', function () {
        var i = 0;
        return breathe.loop(function () {
          return i < testIterations;
        }, function () {
          i++;
        }).then(function () {
          return Promise.resolve(i);
        }).then(function (d) {
          assert.equal(d, testIterations);
        });
      });

    });

  });

  describe('`breathe.times`', function () {
    it('should repeat the body function for n iterations', function () {
      var i = 0;
      return breathe.times(testIterations, function () {
        i++;
      }).then(function (d) {
        assert.equal(i, testIterations);
      });
    });

    it('should pass the body function an incrementing, zero-based counter', function () {
      var previous;
      return breathe.times(testIterations, function (i) {
        if (previous === undefined) {
          assert.equal(0, i);
        } else {
          assert.equal(previous + 1, i);
        }
        previous = i;
      });
    });

    it('should not immediately run', function () {
      var c = initValue;
      var loop = breathe.chain(testIterations, function () {
        c = testValue;
      });
      assert.equal(c, initValue);
      return loop;
    });

    it('should wait for a returned promise to resolve before continuing', function () {
      var v = initValue;
      var iterations = 4;
      var timeout = 5;
      var t = getMilliseconds();
      return breathe.times(iterations, function () {
        assert.equal(v, initValue);
        v = testValue;
        return delayedPromise(timeout).then(function () {
          v = initValue;
        });
      }).then(function () {
        assert.equal(v, initValue);
        // may want to tweak reasonableTime if setTimeout isn't accurate
        var wiggleRoom = 3 / 4;
        var reasonableTime = (getMilliseconds() - t) > iterations * timeout * wiggleRoom;
        assert(reasonableTime);
      });
    });

    it('should relinquish the main thread when over batch time', function () {
      breathe.setBatchTime(5);
      var v = initValue;
      var ret = breathe.times(100, function () {
        return blockingChain(1);
      });
      setTimeout(function () {
        v = testValue;
      }, 15);
      return ret.then(function () {
        assert.equal(v, testValue);
      });
    });

    it('should not relinquish the main thread while under batch time', function () {
      breathe.setBatchTime(500);
      var v = initValue;
      var ret = breathe.times(100, function () {
        return blockingChain(1);
      });
      setTimeout(function () {
        v = testValue;
      }, 15);
      return ret.then(function () {
        assert.equal(v, initValue);
      });
    });

    it('should be able to throw errors', function () {
      return breathe.times(10, function (i) {
        if (i === 4) {
          throw testErrorMessage;
        }
      }).then(function () {
        throw new Error('breathe.times should have thrown an error');
      }, function (err) {
        assert.equal(err, testErrorMessage);
      });
    });

    it('should be able to nest loops', function () {
      var counter = 0;
      var outerLoopIterations = 6;
      var innerLoopIterations = 7;
      return breathe.times(outerLoopIterations, function (i) {
        return breathe.times(innerLoopIterations, function (j) {
          counter++;
        });
      }).then(function () {
        assert.equal(counter, outerLoopIterations * innerLoopIterations);
      });
    });

    describe('`then`', function () {
      it('should be able to resolve a value', function () {
        var i = 0;
        return breathe.times(testIterations, function () {
          i++;
        }).then(function () {
          return i;
        }).then(function (d) {
          assert.equal(d, testIterations);
        });
      });
      it('should be able to resolve a promise', function () {
        var i = 0;
        return breathe.times(testIterations, function () {
          i++;
        }).then(function () {
          return Promise.resolve(i);
        }).then(function (d) {
          assert.equal(d, testIterations);
        });
      });
    });

  });
});