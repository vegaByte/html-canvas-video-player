var cvpHandlers = {
	canvasClickHandler: null,
	videoTimeUpdateHandler: null,
	videoCanPlayHandler: null,
	windowResizeHandler: null,
	errorLoadedHandler: null,
	volumeUpdateHandler: null,
	volumeChangeHandler: null,
	playControlClickHandler: null
};

var CanvasVideoPlayer = function(options) {
	var i;

	this.options = {
		videoSrc        : false, // Required if video element of "videoSelector" doesnt have <source> child
		parent 					: false,
		controls        : true,
		framesPerSecond : 25,
		hideVideo       : true,
		autoplay        : false,
		playOnTouch     : true,
		audio           : true, // can be a element <audio> or boolean (create if true)
		resetOnLastFrame: true,
		loop            : false,
		onTimeUpdate    : false,
		onPlay          : false,
		onPause         : false,
		onReady         : false,
		onError         : false,
		onEnded         : false,
		timeUpdateFreq  : false,
		dev             : true // In "dev" mode errors is showing
	};

	for (i in options) {
		this.options[i] = options[i];
	}
	this.player 				= createElementPro('.video-wrapper', this.options.parent);
	this.videoWrapper 	= createElementPro('.video-responsive', this.player);
	this.video          = createElementPro('%video', this.videoWrapper, {src: this.options.videoSrc});
	this.canvas         = createElementPro('%canvas.canvas', this.videoWrapper);
	this.errors         = [];
	this.ready          = false;
	if (this.options.controls){
		this.controls = createElementPro('.video-controls-wrapper', this.player);
	}

	if (this.options.audio) {
		if (typeof(this.options.audio) === 'string'){
			// Use audio selector from options if specified
			this.audio = document.querySelectorAll(this.options.audio)[0];

			if (!this.audio) {
				this.errors.push('Element for the "audio" not found');
			}
		} else {
			// Creates audio element which uses same video sources
			this.audio = document.createElement('audio');
			if (this.video && this.video.hasChildNodes()){
				this.audio.innerHTML = this.video.innerHTML;
				this.video.parentNode.insertBefore(this.audio, this.video);
				this.audio.load();
			} else if (this.video && this.options.videoSrc){
				this.audio.innerHTML = "<source src='"+ this.options.videoSrc +"'>";
				this.video.parentNode.insertBefore(this.audio, this.video);
				this.audio.load();
			} else {
				this.errors.push('Element for the "audio" not found, set "videoSrc" if the video element doesnt have <source> child.');
			}
		}

		this.iOS = /iPad|iPhone|iPod/.test(navigator.platform) || navigator.userAgent.indexOf('iPhone') >= 0;
		if (this.iOS) {
			// Autoplay doesn't work with audio on iOS
			// User have to manually start the audio
			this.options.autoplay = false;
		}
	}

	if (typeof this.options.onTimeUpdate !== "function" && this.options.onTimeUpdate){
		this.errors.push('Value for the "onTimeUpdate" is not a function');
	}

	if (typeof this.options.onPlay !== "function" && this.options.onPlay){
		this.errors.push('Value for the "onPlay" is not a function');
	}

	if (typeof this.options.onReady !== "function" && this.options.onReady){
		this.errors.push('Value for the "onReady" is not a function');
	}

	if (typeof this.options.onError !== "function" && this.options.onError){
		this.errors.push('Value for the "onError" is not a function');
	}

	if (typeof this.options.onEnded !== "function" && this.options.onEnded){
		this.errors.push('Value for the "onEnded" is not a function');
	}

	if (typeof this.options.onPause !== "function" && this.options.onPause){
		this.errors.push('Value for the "onPause" is not a function');
	}

	if (this.errors.length > 0){
		if (this.options.dev){
			console.error(this.errors.join(', '));
		}
		if (this.options.onError){
			this.options.onError(this.errors);
		}
		return;
	}

	// Canvas context
	this.ctx = this.canvas.getContext('2d');

	this.playing = false;

	this.resizeTimeoutReference = false;
	this.RESIZE_TIMEOUT = 1000;
	if (this.options.onTimeUpdate){
		this.timeUpdateInterval = this.options.timeUpdateFreq || 280; // Interval for timeupdate
	}
	this.lastCurrentTime = 0;

	this.init();
	this.bind();
};

CanvasVideoPlayer.prototype.init = function() {
	var self = this;

	// Errors on video load
	this.video.addEventListener('error', cvpHandlers.errorLoadedHandler = function(e) {
		// video playback failed - show a message saying why
		switch (e.target.error.code) {
			case e.target.error.MEDIA_ERR_ABORTED:
				self.errors.push('You aborted the video playback.');
				break;
			case e.target.error.MEDIA_ERR_NETWORK:
				self.errors.push('A network error caused the video download to fail part-way.');
				break;
			case e.target.error.MEDIA_ERR_DECODE:
				self.errors.push('The video playback was aborted due to a corruption problem or because the video used features your browser did not support.');
				break;
			case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
				self.errors.push('The video could not be loaded, either because the server or network failed or because the format is not supported.');
				break;
			default:
				self.errors.push('An unknown error occurred.');
				break;
		}
		if (self.options.onError){
			self.options.onError(self.errors);
		}
		if (self.options.dev){
			console.error(self.errors.join(', '));
		}
	});

	if (this.controls){
		this.createControls();
	}

	this.video.load();

	this.setCanvasSize();

	if (this.options.hideVideo) {
		this.video.style.display = 'none';
	}
};

// Used most of the jQuery code for the .offset() method
CanvasVideoPlayer.prototype.getOffset = function(elem) {
	var docElem, rect, doc;

	if (!elem) {
		return;
	}

	rect = elem.getBoundingClientRect();

	// Make sure element is not hidden (display: none) or disconnected
	if (rect.width || rect.height || elem.getClientRects().length) {
		doc = elem.ownerDocument;
		docElem = doc.documentElement;

		return {
			top: rect.top + window.pageYOffset - docElem.clientTop,
			left: rect.left + window.pageXOffset - docElem.clientLeft
		};
	}
};

CanvasVideoPlayer.prototype.jumpTo = function(percentage) {
	this.video.currentTime = this.video.duration * percentage;

	if (this.options.audio) {
		this.audio.currentTime = this.audio.duration * percentage;
	}
};

CanvasVideoPlayer.prototype.bind = function() {
	var self = this;

	// Playes or pauses video on canvas click
	if (this.options.playOnTouch){
		this.canvas.addEventListener('click', cvpHandlers.canvasClickHandler = function() {
			self.playPause();
		});
	}

	// On every time update draws frame
	this.video.addEventListener('timeupdate', cvpHandlers.videoTimeUpdateHandler = function() {
		self.drawFrame();
		if (self.controls){
			self.updateTimeline();
			self.updateTimeDisplay();
		}
	});

	// Draws first frame
	this.video.addEventListener('canplay', cvpHandlers.videoCanPlayHandler = function() {
		self.drawFrame();
		if (self.options.onReady && !self.ready){
			self.options.onReady();
			self.ready = true;
		}
	});

	// To be sure 'canplay' event that isn't aloready fired
	if (this.video.readyState >= 2) {
		self.drawFrame();
	}

	if (self.options.autoplay) {
	  self.play();
	}

	// Click on the video seek video
	if (this.options.controls){
		this.timeline.addEventListener('click', function(e) {
			var offset = e.clientX - self.getOffset(self.timeline).left;
			var percentage = offset / self.timeline.offsetWidth;
			self.jumpTo(percentage);
		});
	}

	// Cache canvas size on resize (doing it only once in a second)
	window.addEventListener('resize', cvpHandlers.windowResizeHandler = function() {
		clearTimeout(self.resizeTimeoutReference);

		self.resizeTimeoutReference = setTimeout(function() {
			self.setCanvasSize();
			self.drawFrame();
		}, self.RESIZE_TIMEOUT);
	});
	this.audioControlEnabled = false;
	if (this.controls){
		if (!this.iOS && this.audioControlEnabled){
			// Triggered when leave the dragging
			this.volumeControl.addEventListener('change', cvpHandlers.volumeChangeHandler = function(e) {
				self.setVolume(self.volumeControl.value);
			});
			// Triggered when dragging
			this.volumeControl.addEventListener('input', cvpHandlers.volumeUpdateHandler = function() {
				self.setVolume(self.volumeControl.value);
			});
		}
		this.playControl.addEventListener('click', cvpHandlers.playControlClickHandler = function() {
			self.playPause();
		});
	}

	this.unbind = function() {
		if (this.options.playOnTouch){
			this.canvas.removeEventListener('click', cvpHandlers.canvasClickHandler);
		}
		this.video.removeEventListener('timeupdate', cvpHandlers.videoTimeUpdateHandler);
		this.video.removeEventListener('canplay', cvpHandlers.videoCanPlayHandler);
		window.removeEventListener('resize', cvpHandlers.windowResizeHandler);

		if (this.options.audio) {
			this.audio.parentNode.removeChild(this.audio);
		}
		if (this.controls){
			this.volumeControl.removeEventListener('change', cvpHandlers.volumeChangeHandler);
			this.volumeControl.removeEventListener('input', cvpHandlers.volumeUpdateHandler);
			this.playControl.removeEventListener('click', cvpHandlers.playControlClickHandler);
		}
	};
};

CanvasVideoPlayer.prototype.updateTimeline = function() {
	var percentage = (this.video.currentTime * 100 / this.video.duration).toFixed(2);
	this.timelinePassed.style.width = percentage + '%';
};

CanvasVideoPlayer.prototype.setCanvasSize = function() {
	this.width = this.canvas.clientWidth;
	this.height = this.canvas.clientHeight;

	this.canvas.setAttribute('width', this.width);
	this.canvas.setAttribute('height', this.height);
};

CanvasVideoPlayer.prototype.play = function() {
	this.lastTime = Date.now();
	if (this.controls){
		this.togglePlayElement();
	}
	this.playing = true;
	this.loop();

	if (this.options.audio) {
		// Resync audio and video
		this.audio.currentTime = this.video.currentTime;
		this.audio.play();
	}
	if (this.options.onPlay){
		this.options.onPlay();
	}
};

CanvasVideoPlayer.prototype.pause = function() {
	if (this.controls){
		this.togglePlayElement();
	}
	this.playing = false;

	if (this.options.audio) {
		this.audio.pause();
	}
	if (this.options.onPause){
		console.log('CanvasVideoPlayer.prototype.pause');
		this.options.onPause();
	}
};

CanvasVideoPlayer.prototype.playPause = function() {
	if (this.playing) {
		this.pause();
	}
	else {
		this.play();
	}
};

CanvasVideoPlayer.prototype.loop = function() {
	var self = this;

	var time = Date.now();
	var elapsed = (time - this.lastTime) / 1000;

	// Render
	if(elapsed >= (1 / this.options.framesPerSecond)) {
		this.video.currentTime = this.video.currentTime + elapsed;
		this.lastTime = time;
		// Resync audio and video if they drift more than 300ms apart
		if(this.audio && Math.abs(this.audio.currentTime - this.video.currentTime) > 0.3){
			this.audio.currentTime = this.video.currentTime;
		}
		if(this.options.onTimeUpdate && Math.abs(this.video.currentTime - this.lastCurrentTime) > this.timeUpdateInterval/1000){
			this.lastCurrentTime = this.video.currentTime;
			this.options.onTimeUpdate();
		}
	}

	// If we are at the end of the video stop
	if (this.video.currentTime >= this.video.duration) {
		this.togglePlayElement();
		this.playing = false;
		if (this.options.onEnded){
			this.options.onEnded();
		}

		if (this.options.resetOnLastFrame === true) {
			this.video.currentTime = 0;
		}

		if (this.options.loop === true) {
			this.video.currentTime = 0;
			this.play();
		}
	}

	if (this.playing) {
		this.animationFrame = requestAnimationFrame(function(){
			self.loop();
		});
	}
	else {
		cancelAnimationFrame(this.animationFrame);
	}
	// On time update callback
	if (this.options.onTimeUpdate){
		this.options.onTimeUpdate(this.video.currentTime);
	}

};

CanvasVideoPlayer.prototype.drawFrame = function() {
	this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
};

CanvasVideoPlayer.prototype.getCurrentTime = function() {
	return this.video.currentTime;
};

CanvasVideoPlayer.prototype.setVolume = function(vol) {
	vol = vol / 100;
	if (vol > 1){
		this.audio.volume = 1;
	} else if (vol < 0){
		this.audio.volume = 0;
	} else {
		this.audio.volume = vol;
	}
	this.updateVolumeIcon();
};
// Build elements controls
CanvasVideoPlayer.prototype.createControls = function() {
	// CONTAINER
	this.controlsContainer = createElementPro('.video-controls', this.controls);

	// PLAY PAUSE
	this.playControl = createElementPro('%button.play-pause', this.controlsContainer);
	var playPauseSvg = '<svg width="100%" height="100%" viewBox="0 0 36 36" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path id="play-path" d="M 11 10 L 18 13.74 18 22.28 11 26 M 18 13.74 L 26 18 26 18 18 22.28"><animate id="play-button-animation" begin="indefinite" attributeT ype="XML" attributeName="d" fill="freeze" to="M11,10 L17,10 17,26 11,26 M20,10 L26,10 26,26 20,26" from="M11,10 L18,13.74 18,22.28 11,26 M18,13.74 L26,18 26,18 18,22.28" dur="0.1s" keySplines=".4 0 1 1" repeatCount="1"></animate></path></defs><use xlink:href="#play-path"></use></svg>';
	this.playControl.innerHTML = playPauseSvg;

	// PROGRESS BAR
	var timeLineParent;
	if (this.options.controls){ timeLineParent = this.controlsContainer; }
	else { timeLineParent = this.videoWrapper; }
	var iOsClass = this.iOS ? 'ios' : '';
	this.timeline = createElementPro('.video-timeline '+iOsClass, timeLineParent);
	this.timelinePassed = createElementPro('.video-timeline-passed', this.timeline);

	// VOLUME
	if (!this.iOS && this.audioControlEnabled){
		var volumeContainer = createElementPro('.volume-container.needsclick', this.controlsContainer);
		var volumeIcon = '<svg id="volume-icon" fill="#FFFFFF" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
		volumeContainer.innerHTML = volumeIcon;
		this.volumeControl = createElementPro('%input#volume-control.volume-control.needsclick', volumeContainer, {
			type:'range', min:'0', max:'100', value:'100'
		});
	}

	// TIME
	this.timeDisplay = createElementPro('.time', this.controlsContainer);
	this.timeDisplay.innerHTML = '00:00';
};

// ==== CONTROLS INTERACTIONS =====
// PLAY PAUSE
CanvasVideoPlayer.prototype.togglePlayElement = function() {
	var pause = "M11,10 L18,13.74 18,22.28 11,26 M18,13.74 L26,18 26,18 18,22.28",
		play = "M11,10 L17,10 17,26 11,26 M20,10 L26,10 26,26 20,26",
		$animation = document.getElementById('play-button-animation'); //$('#play-button-animation');
	var dPlay = "M 11 10 L 18 13.74 18 22.28 11 26 M 18 13.74 L 26 18 26 18 18 22.28";

	$animation.setAttribute('from', this.playing ? play : pause);
	$animation.setAttribute('to', this.playing ? pause : play);
	$animation.beginElement();
}

// VOLUME ICON
CanvasVideoPlayer.prototype.updateVolumeIcon = function() {
	var volumeHigh = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
	var volumeLow = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
	var volumeMute = '<path d="M7 9v6h4l5 5V4l-5 5H7z" x="0"/>';

	var volume = this.volumeControl.value;
	var icon = document.getElementById('volume-icon');

	if (volume >= 75) {
		icon.innerHTML = volumeHigh;
	} else if (volume < 75 && volume > 0) {
		icon.innerHTML = volumeLow;
	} else {
		icon.innerHTML = volumeMute;
	}
}

// TIME DISPLAY
CanvasVideoPlayer.prototype.updateTimeDisplay = function() {
	var time = Math.round(this.video.currentTime);
	var minutes = Math.floor(time / 60);
	var seconds = time - minutes * 60;
	var hours = Math.floor(time / 3600);
	// time = time - hours * 3600;
	var timeFormat = str_pad_left(minutes,'0',2)+':'+str_pad_left(seconds,'0',2);

	this.timeDisplay.innerHTML = timeFormat;
}

// Create a HTML element FROM custom "haml" string
// @haml   = "%tag#id.class1.class2" // custom haml string, NOTE: just work with %#.. secuence
// @parent = '#parent', [Object document.element]
// @attrs  = { width: '100', height: '20', etc... }
var createElementPro = function (haml, parent, attrs){
	// get type, id and classes for the element
	var validChars = ['#', '%', '.'];
	var ids        = [];
	var classes    = [];
	var types      = [];
	for (var i = 0; i < haml.length; i) {
		switch (haml[i]) {
			case '%':
				var type = '';
				i++;
				while (validChars.indexOf(haml[i]) == -1 && i < haml.length){
					type += haml[i];
					i++;
				}
				types.push(type);
			break;
			case '#':
				var id = '';
				i++;
				while (validChars.indexOf(haml[i]) == -1 && i < haml.length){
					id += haml[i];
					i++;
				}
				ids.push(id);
			break;
			case '.':
				var clas = '';
				i++;
				while (validChars.indexOf(haml[i]) == -1 && i < haml.length){
					clas += haml[i];
					i++;
				}
				classes.push(clas);
			break;
			default:
				i++;
			break;
		}
	}

	var type = 'div';
	var classNames = '';
	var id = '';

	if (types.length > 0){ type = types[0]; }
	if (classes.length > 0){ classNames = classes.join(' '); }
	if (ids.length > 0){ id = ids[0]; }

	// create the element
	var element = document.createElement(type);
	if (classNames){ element.className = classNames; }
	if (id){ element.id = id; }

	// append the element to parent if was sender
	if (parent) {
		if (typeof (parent) === 'string'){
			document.querySelector(parent).appendChild(element);
		} else if (parent instanceof HTMLElement){
			parent.appendChild(element);
		}
	}

	if (attrs){
		for (var k in attrs){
			var customAttribute = document.createAttribute(k);
			customAttribute.value = attrs[k];
			element.attributes.setNamedItem(customAttribute);
		}
	}

	return element;
}

// Return a time string with format "mm:ss"
function str_pad_left(string,pad,length) {
    return (new Array(length+1).join(pad)+string).slice(-length);
}
