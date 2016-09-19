// Web Worker used in webWorkerCounter.html to show how breathe.js can be used 
// inside of a webworker.

importScripts('../breathe.js');


// Because web workers don't need to respond as much as a web page, you can set 
// batch time to be higher to be more efficient. A higher amount means that the 
// web worker will likely take longer to respond to messages (breathe will block
// for that amount of time).

breathe.setBatchTime(100); 

var i = 0;

self.addEventListener('message', function (e) {
	self.postMessage(i);
});

var synchronousLoop = function () {
	while(true){
		i++;
	}	
};

var asynchronousLoop = function () {
	breathe.loop(function () { return true; }, function () {
		i++;
	});
};

asynchronousLoop();
/* comment out the previous line and uncomment the following one to see how web 
workers don't respond while in synchronous loops */
// synchronousLoop();

