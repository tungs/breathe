# breathe.js

## Unfreeze your code with breathe.js

Using breathe.js, you can adapt your JavaScript code to be asynchronous, pausable, and nonblocking, while running in the main thread.

### How does it work?
With breathe.js, you subdivide large, computation-heavy functions into smaller tasks that don't run all at once. The library offers a general replacement to loops (a primary source of blocking code), exiting after a certain amount of time and allowing the webpage and other parts of the program to respond, before reentering the loop. Converting code is fairly straightforward, preserving a function's overall structure and logic.

Breathe.js supports, and extensively uses promises, to make it easier to structure asynchronous code and handle errors. What's more, the library uses a variant of promises that adds methods to stop, pause, and unpause the promise.

### Can't web workers run asynchronous, nonblocking code?
Unfortunately web workers can't do everything (yet). They can't acccess DOM, nor can most browsers' web workers access a canvas (though there is an OffscreenCanvas in development). You may also want to show a function as it is run, like showing a drawing as it is generated, which would require some nonblocking element.

Web workers still use a single thread within the worker, meaning a computation-heavy function can block other code -- namely message handling-- from running. Breathe.js works within web workers, so they can respond in the middle of executing a long-running function. It also makes it easy to pause and unpause code running within the worker.

### Some Notes of Warning
Even though breathe.js is wonderful, convenient, and easy-to-use, there are frequently better solutions than running computationally taxing code within the main thread of a client. Web workers, in particular, were created for multithreaded processing. Alternatively, moving computation to the server can potentially improve the client experience.

Because breathe.js frees up blocking code, it doesn't usually trigger a web browser's frozen page warning. If there are parts that remain processor intensive, like an infinite loop or chunks that execute longer than expected, it can make the UI sluggish or nonresponsive. Without the warning, it can be more difficult to stop the page.

## Creating breathable code
Breathe.js currently offers three main ways to create breathable code. [`breathe.start()`](#breathe-start) creates a breathable promise chain. As an alternative to `while` loops, [`breathe.loop()`](#breathe-loop-config) creates an asynchronous loop, with a condition and a body. And [`breathe.times()`](#breathe-times-config) creates a loop with a fixed number of iterations and a body, a replacement for some `for` loops. 

### The anatomy of a breatheable function
Large functions can be subdivided into blocks of code, with variable declarations and synchronous and/or asynchronous code.
```js
function () {
  var variablesSharedInsideOfThisBlock;
  synchronousCode();
  return asynchronousCode();
}
```

You don't need to have both synchronous code or asynchronous code, but you probably want some code if you want the function to do anything.

Asynchronous code usually involves subsequent code blocks. For instance, breathe.loop takes a body as an argument, which is a code block. This allows you to nest loops:
```js
function nestedLoop {
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
function sequentialLoops {
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

You can check out some examples in the demos folder of this repository.

## API

### Breathable Promises  
**Breathable Promises** are similar to [traditional promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), though they implement additional methods to stop, pause, and unpause promise chains. Like traditional promises, they implement `then()` and `catch()` methods, though they store the promise chain to a private, internal variable.

 * <a name="breathe-start" href="#breathe-start">#</a> breathe.**start**([*initValue*]) 
   * creates and returns a _breathable promise_, with a promise chain initialized to initValue (via Promise.resolve(_initValue_)).

 * <a name="breathe-promise-then" href="#breathe-promise-then">#</a> _breathablePromise_.**then**(*onFulfilled*[, *onRejected*]) 
   * adds functions *onFulfilled* and *onRejected* to the promise chain, which are called when the promise is fulfilled or rejected. Similar to [`Promise.prototype.then()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then), except it alters its internal promise chain instead of returning a new promise. Both *onFulfilled* and *onRejected* can optionally return a value to pass on to the next promise chain, or a promise (breathable or not), that are resolved or rejected before continuing down the promise chain. Returns the invoking _breathablePromise_.

* <a name="breathe-promise-catch" href="#breathe-promise-catch">#</a> _breathablePromise_.**catch**(*onRejected*)
  * adds function *onRejected* to the promise chain, which is called when the promise is rejected. Similar to [`Promise.prototype.catch()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch), except it alters its internal promise chain instead of returning a new promise. *onRejected* can optionally return a value to pass on to the next promise chain, or a promise (breathable or not), that are resolved or rejected before continuing down the promise chain. Returns the invoking _breathablePromise_.

* <a name="breathe-promise-pause" href="#breathe-promise-pause">#</a> _breathablePromise_.**pause**()
  * requests _breathablePromise_ to pause its current chain. Because not all promises in the chain may be pauseable, pausing may be delayed until the current promise resolves. Returns a promise that resolves when the current chain is paused.

* <a name="breathe-promise-unpause" href="#breathe-promise-unpause">#</a> _breathablePromise_.**unpause**()
  * requests _breathablePromise_ to unpause its current chain. Returns a resolved promise.

* <a name="breathe-promise-stop" href="#breathe-promise-stop">#</a> _breathablePromise_.**stop**()
  * requests _breathablePromise_ to stop its current chain. Because not all promises in the chain may be stoppable, stopping may be delayed until the current promise resolves. Returns a promise that resolves when the current chain is stopped.

* <a name="breathe-promise-add-method" href="#breathe-promise-add-method">#</a> _breathablePromise_.**addMethod**(*name*, *methodFn*)
  * maps function *methodFn* to a new method of _breathablePromise_. It can be invoked via _breathablePromise_.*name()*. Useful for accessing variables inside closures.

* <a name="breathe-promise-add-methods" href="#breathe-promise-add-methods">#</a> _breathablePromise_.**addMethods**(*methods*)
  * maps *methods* to a new methods of _breathablePromise_, using key value pairs of *methods* to refer to *name* and *method function*. The new methods can be invoked via _breathablePromise_.*name()*. Useful for accessing variables inside closures.


### Loops
**Breathable Loops** are breathable promises that repeatedly iterate over a *body* while a *condition* is true. They can be stopped, paused, or unpaused. They can serve as a replacement to `while` loops.
* <a name="breathe-loop-config" href="#breathe-loop-config">#</a> breathe.**loop**(*config*)
  * *config*.**condition** [required]
    * an argumentless function that should return false (or a falsey value) if the loop should exit  
  * *config*.**body** [required]
    * a function that gets called for every iteration of the loop. It can optionally return a value; if it returns a promise (breathable or traditional), the loop does not continue iterating until the promise resolves.

* <a name="breathe-loop-condition-body" href="#breathe-loop-condition-body">#</a> breathe.**loop**(*condition*, *body*, [*config*])
  * equivalent to calling breathe.loop, with *config.condition* and *config.body* set to *condition* and *body*
  
### Special Loops
**Times Loops** are breathable promises that repeatedly iterate over a *body* for a fixed number of *iterations*. They can be stopped, paused, or unpaused. They can serve as a replacement to `for` loops.
* <a name="breathe-times-config" href="#breathe-times-config">#</a> breathe.**times**(*config*)
  * *config*.**iterations** [required]
    * a value or function() that returns a value, equal to the number of iterations of the loop. If *iterations* is a function, it is evaluated only once, when the loop starts.
  * *config*.**body** [required]
    * a function(iterationNumber) that gets called for every iteration of the loop. The first argument is the current iteration number (starting at 0). It can optionally return a value; if it returns a promise (breathable or traditional), the loop does not continue iterating until the promise resolves.

* <a name="breathe-times-iterations-body" href="#breathe-times-iterations-body">#</a> breathe.**times**(*iterations*, *body*, [*config*])
  * equivalent to calling breathe.times, with *config.iterations* and *config.body* set to *iterations* and *body*
