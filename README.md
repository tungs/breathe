# breathe.js
Using breathe.js, you can easily write nonblocking JavaScript that runs in the main thread of a web page.

## How does it work? ##
With **breathe.js**, you divide large, processor-intensive functions into smaller tasks that don't run all at once. The library offers a replacement to loops, function calls, and code blocks, automatically exiting a function after a certain amount of time and allowing the webpage to respond, before returning to the function.

As a simple example, in traditional JavaScript, you may have a long looping function:
```js
function longLoopingFunction() {
  var i;
  for(i = 0; i < 100000; i++) {
    trickyFunction();
  }
}
```

Here `trickyFunction()` runs 100,000 times, without letting any other code run or UI respond. But with breathe.js, the same code can be written as:

```js
function breathableLongLoopingFunction() {
  return breathe.times(100000, function (i) {
    trickyFunction();
  });
}
```

Here the function also runs sequentially, but if it runs for too long (over 17 milliseconds by default), breathe.js relinquishes the main thread to allow other functions to run or UI to respond, then runs the remaining loop, repeatedly relinquishing if necessary.

By using promise conventions and nested functions, [converting code](https://breathejs.org/Using-Breathe.html#Converting-Code) is usually straightforward, preserving a function's overall structure and logic. Converting code makes it asynchronous, and adds methods to stop, pause, and unpause the code. Read more about how to use it on the ['Using breathe.js' page](https://breathejs.org/Using-Breathe.html#Converting-Code).

## Can't Web Workers run nonblocking code? ##
<a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers" target="_blank">Web workers</a> are designed to run asynchronous, nonblocking code (in another thread, to boot!), but unfortunately they can't do everything. Variables aren't easily shared with a page's main thread, instead relying on message passing. Workers can't acccess DOM, nor can most access a canvas (though there is an <a href="https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas" target="_blank">OffscreenCanvas</a> in development). Since breathe.js can run inside the main thread of a page, it can access its variables, DOM, and canvases.

Web workers still use a single thread within the worker, so a computation-heavy function can block other code— namely message handling— from running. Breathe.js works within web workers, so they can respond in the middle of executing a long-running function. It also makes it easy to pause and unpause code running within the worker.

## Some notes of warning ##
*  Even though breathe.js is wonderful, convenient, and easy-to-use, there are frequently better solutions than running computationally taxing code within the main thread of a client. <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers" target="_blank">Web workers</a>, in particular, were created for true multithreaded processing. Or in some cases, you may want to move computation to a server.
*  Because breathe.js frees up blocking code, it doesn't usually trigger a web browser's frozen page warning. If there are parts that remain processor intensive, like an infinite loop of <code>console.log</code> statements or chunks that execute longer than expected, it can make the UI sluggish or nonresponsive. Without the warning, it can be more difficult to stop the page.

## How do I get started? ##
Check out the ['Examples' page](https://breathejs.org/examples/index.html) to see what you can do with it, and read the ['Using breathe.js' page](https://breathejs.org/Using-Breathe.html) for an in-depth explanation.

## Creating breathable code
Breathe.js currently offers three main ways to create breathable code. [`breathe.chain()`](#breathe-chain) creates a breathable promise chain. As an alternative to `while` loops, [`breathe.loop()`](#breathe-loop-config) creates an asynchronous loop, with a condition and a body. And [`breathe.times()`](#breathe-times-config) creates a loop with a fixed number of iterations and a body, a replacement for some `for` loops. 

### The anatomy of a breatheable function
Large functions can be subdivided into blocks of code, with variable declarations and synchronous and/or asynchronous code.
```js
function () {
  var variablesSharedInsideOfThisBlock;
  synchronousCode();
  return asynchronousCode();
}
```

You don't need to have both synchronous code or asynchronous code, but asynchronous code usually involves subsequent code blocks. For instance, breathe.loop takes a body as an argument, which is a code block. This allows you to nest loops:
```js
function nestedLoop() {
  var running;
  running = true;
  return breathe.loop(function () { return running; }, function () {
      // another code block
      var i;
      i = 0;
      return breathe.loop({ function () { return running && i++ < 50; },
        function () {
          running = doSomethingAwesome(c);
        }
      );
    }
  );
}
```

You can use the .then() method of promises (the asynchronous code) to chain code blocks together, so you can run code after asynchronous code completes.
```js
function sequentialLoops() {
  var i = 0;
  return breathe.loop(function () { i++ < 50;}, function () { 
      console.log('Counting up: ', i);
    }
  ).then(function () {
    // another code block
    return breathe.loop(function () { i-- >= 0;}, function () {
      console.log('Counting down: ', i);
    });
  });
}
```

## **breathe.js** API

### Breathable Chains  
**Breathable Chains** are similar to [traditional promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) in that they implement `then()` and `catch()` methods, though they return the original chain object rather than a new promise. _Breathable chains_ implement additional methods to stop, pause, and unpause promise chains.

* <a name="breathe-chain" href="#breathe-chain">#</a> breathe.**chain**([*initValue*]) 
    * creates and returns a _breathable chain_, with a promise chain initialized to initValue.

* <a name="breathe-chain-then" href="#breathe-chain-then">#</a> _breathableChain_.**then**(*onFulfilled*[, *onRejected*]) 
    * adds functions *onFulfilled* and *onRejected* to the promise chain, which are called when the promise is fulfilled or rejected. Similar to [`Promise.prototype.then()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then), except it alters its internal promise chain instead of returning a new promise. Both *onFulfilled* and *onRejected* can optionally return a value to pass on to the next promise chain, or a promise (breathable or not), that are resolved or rejected before continuing down the promise chain. Returns the invoking _breathableChain_.

* <a name="breathe-chain-catch" href="#breathe-chain-catch">#</a> _breathableChain_.**catch**(*onRejected*)
    * adds function *onRejected* to the promise chain, which is called when the promise is rejected. Similar to [`Promise.prototype.catch()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch), except it alters its internal promise chain instead of returning a new promise. *onRejected* can optionally return a value to pass on to the next promise chain that are resolved or rejected before continuing down the promise chain. Returns the invoking _breathableChain_.

* <a name="breathe-chain-pause" href="#breathe-chain-pause">#</a> _breathableChain_.**pause**()
    * requests _breathableChain_ to pause its current chain. Because not all promises in the chain may be pauseable, pausing may be delayed until the current promise resolves. Returns a promise that resolves when the current chain is paused.

* <a name="breathe-chain-unpause" href="#breathe-chain-unpause">#</a> _breathableChain_.**unpause**()
    * requests _breathableChain_ to unpause its current chain. Returns a resolved promise.

* <a name="breathe-chain-stop" href="#breathe-chain-stop">#</a> _breathableChain_.**stop**()
    * requests _breathableChain_ to stop its current chain. Because not all promises in the chain may be stoppable, stopping may be delayed until the current promise resolves. Returns a promise that resolves when the current chain is stopped.

### Loops
**Breathable Loops** are breathable chains that repeatedly iterate over a *body* while a *condition* is true. They can be stopped, paused, or unpaused. They can serve as a replacement to `while` loops.
* <a name="breathe-loop-config" href="#breathe-loop-config">#</a> breathe.**loop**(*config*)
    * *config*.**condition** [required]
        * an argumentless function that should return false (or a falsey value) if the loop should exit  
    * *config*.**body** [required]
        * a function that gets called for every iteration of the loop. It can optionally return a value; if it returns a promise or chain (breathable or traditional), the loop does not continue iterating until the promise or chain resolves.

* <a name="breathe-loop-condition-body" href="#breathe-loop-condition-body">#</a> breathe.**loop**(*condition*, *body*, [*config*])
    * equivalent to calling breathe.loop, with *config.condition* and *config.body* set to *condition* and *body*
  
### Special Loops
**Times Loops** are breathable chains that repeatedly iterate over a *body* for a fixed number of *iterations*. They can be stopped, paused, or unpaused. They can serve as a replacement to some `for` loops.
* <a name="breathe-times-config" href="#breathe-times-config">#</a> breathe.**times**(*config*)
    * *config*.**iterations** [required]
        * a value equal to the number of iterations of the loop.
    * *config*.**body** [required]
        * a function(iterationNumber) that gets called for every iteration of the loop. The first argument is the current iteration number (starting at 0). It can optionally return a value; if it returns a promise (breathable or traditional), the loop does not continue iterating until the promise resolves.

* <a name="breathe-times-iterations-body" href="#breathe-times-iterations-body">#</a> breathe.**times**(*iterations*, *body*, [*config*])
    * equivalent to calling breathe.times, with *config.iterations* and *config.body* set to *iterations* and *body*
