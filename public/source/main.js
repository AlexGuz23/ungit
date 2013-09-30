
var _ = require('underscore');
var ko = require('../vendor/js/knockout-2.2.1');
var $ = require('../vendor/js/jquery-2.0.0.min');
require('../vendor/js/jquery.dnd_page_scroll');
require('../vendor/js/bootstrap/modal');
require('../vendor/js/jquery-ui-1.10.3.custom.js');
var hasher = require('hasher');
var crossroads = require('crossroads');
var AppViewModel = require('./app');
var screens = require('./screens');
var CrashViewModel = screens.CrashViewModel;
var PathViewModel = screens.PathViewModel;
var HomeViewModel = screens.HomeViewModel;

// Request animation frame polyfill
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelRequestAnimationFrame = window[vendors[x]+
          'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());


var requestAnimationFrame = window.requestAnimationFrame;

ko.bindingHandlers.debug = {
    init: function(element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        console.log('DEBUG INIT', value);
    },
    update: function(element, valueAccessor, allBindingsAccessor, viewModel) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        console.log('DEBUG UPDATE', value);
    }
};

ko.bindingHandlers.fastClick = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
    	var value = valueAccessor();
    	new google.ui.FastButton(element, function() {
    		var valueUnwrapped = ko.utils.unwrapObservable(value);
        	valueUnwrapped.call(viewModel);
    	});
    }
};

ko.bindingHandlers.editableText = {
    init: function(element, valueAccessor) {
        $(element).on('blur', function() {
            var observable = valueAccessor();
            observable( $(this).text() );
        });
    },
    update: function(element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        $(element).text(value);
    }
};

var currentlyDraggingViewModel = null;

ko.bindingHandlers.dragStart = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        var value = valueAccessor();
        element.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('Text', 'ungit');
            currentlyDraggingViewModel = viewModel;
            var valueUnwrapped = ko.utils.unwrapObservable(value);
            valueUnwrapped.call(viewModel, true);
        });
    }
}
ko.bindingHandlers.dragEnd = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        var value = valueAccessor();
        element.addEventListener('dragend', function() {
            currentlyDraggingViewModel = null;
            var valueUnwrapped = ko.utils.unwrapObservable(value);
            valueUnwrapped.call(viewModel, false);
        });
    }
}


ko.bindingHandlers.dropOver = {
    init: function(element, valueAccessor) {
        element.addEventListener('dragover', function(e) {
            var value = valueAccessor();
            var valueUnwrapped = ko.utils.unwrapObservable(value);
            if (!valueUnwrapped)
                return;
            if (e.preventDefault)
                e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        });
    }
}

ko.bindingHandlers.dragEnter = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        element.addEventListener('dragenter', function(e) {
            var value = valueAccessor();
            var valueUnwrapped = ko.utils.unwrapObservable(value);
            valueUnwrapped.call(viewModel, currentlyDraggingViewModel);
        });
    }
}

ko.bindingHandlers.dragLeave = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        element.addEventListener('dragleave', function(e) {
            var value = valueAccessor();
            var valueUnwrapped = ko.utils.unwrapObservable(value);
            valueUnwrapped.call(viewModel, currentlyDraggingViewModel);
        });
    }
}

ko.bindingHandlers.drop = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        var value = valueAccessor();
        element.addEventListener('drop', function(e) {
            if (e.preventDefault)
                e.preventDefault();
            var valueUnwrapped = ko.utils.unwrapObservable(value);
            valueUnwrapped.call(viewModel, currentlyDraggingViewModel);
        });
    }
}

ko.bindingHandlers.shown = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        var value = valueAccessor();
        var valueUnwrapped = ko.utils.unwrapObservable(value);
        valueUnwrapped.call(viewModel);
    }
};


(function scrollToEndBinding() {
    ko.bindingHandlers.scrolledToEnd = {
        init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            element.valueAccessor = valueAccessor;
            element.viewModel = viewModel;
            element.setAttribute('data-scroll-to-end-listener', true);
        }
    };

    var checkAtEnd = function(element) {
        var elementEndY = $(element).offset().top + $(element).height();
        var windowEndY = $(document).scrollTop() + document.documentElement.clientHeight;
        if ( windowEndY > elementEndY - document.documentElement.clientHeight / 2) {
            var value = element.valueAccessor();
            var valueUnwrapped = ko.utils.unwrapObservable(value);
            valueUnwrapped.call(element.viewModel);
        }
    }
    function scrollToEndCheck() {
        var elems = document.querySelectorAll('[data-scroll-to-end-listener]');
        for(var i=0; i < elems.length; i++)
            checkAtEnd(elems[i]);
    }

    $(window).scroll(scrollToEndCheck);
    $(window).resize(scrollToEndCheck);
})();

ko.bindingHandlers.modal = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        $(element).modal();
        var value = ko.utils.unwrapObservable(valueAccessor());
        $(element).on('hidden.bs.modal', function () {
            value.onclose.call(viewModel);
        });
        value.closer.call(viewModel, function() {
            $(element).modal('hide');
        });
    }
};

ko.bindingHandlers.autocomplete = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        var handleKeyEvent = function(event) {
            lastChar = $(element).val().slice(-1);
            if(lastChar == '/' || lastChar == '\\'){  // When "/" or "\"
                app.get('/fs/listDirectories', {term: $(element).val()}, function(err, directoryList) {
                    if (err) {
                        if (err.errorCode == 'read-dir-failed') return true;
                        else return false;
                    } else {
                        $(element).autocomplete({
                            source: directoryList,
                            messages: {
                                noResults: '',
                                results: function() {}
                            }
                        });
                        $(element).autocomplete("search", $(element).val());
                    }
                });
            } else if(event.keyCode == 13){
                event.preventDefault();
                url = '/#/repository?path=' + encodeURI($(element).val());
                window.location = url;
            }

            return true;
        };
        ko.utils.registerEventHandler(element, "keyup", _.debounce(handleKeyEvent, 100));
    }
};

// For some reason the standard hasFocus binder doesn't fire events on div objects with tabIndex's
ko.bindingHandlers.hasFocus2 = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
        element.addEventListener('focus', function() {
            valueAccessor()(true);
        });
        element.addEventListener('blur', function() {
            valueAccessor()(false);
        });
    }
};


// Used to catch when a user was tabbed away and re-visits the page. 
// If fs.watch worked better on Windows (i.e. on subdirectories) we wouldn't need this
(function detectReActivity() {
    var lastMoved = Date.now();
    document.addEventListener('mousemove', function() {
        // If the user didn't move for 3 sec and then moved again, it's likely it's a tab-back
        if (Date.now() - lastMoved > 3000) {
            console.log('Fire change event due to re-activity');
            app.workingTreeChanged();
        }
        lastMoved = Date.now();
    });
})();


var prevTimestamp = 0;
var updateAnimationFrame = function(timestamp) {
    var delta = timestamp - prevTimestamp;
    prevTimestamp = timestamp;
    app.updateAnimationFrame(delta);
    window.requestAnimationFrame(updateAnimationFrame);
}
window.requestAnimationFrame(updateAnimationFrame);

var oldWindowOnError = window.onerror;
window.onerror = function(err) {
    crashHandler.content(new CrashViewModel());
    if (oldWindowOnError) oldWindowOnError(err);
};


var CrashHandlerViewModel = function() {
    var self = this;
    this.content = ko.observable();
}
exports.CrashHandlerViewModel = CrashHandlerViewModel;
CrashHandlerViewModel.prototype.templateChooser = function(data) {
    if (!data) return '';
    return data.template;
};


var crashHandler = new CrashHandlerViewModel();
var app = new AppViewModel(crashHandler, browseTo);
crashHandler.content(app);

ko.applyBindings(crashHandler);

// routing
crossroads.addRoute('/', function() {
    app.path('');
    app.content(new HomeViewModel(app));
});

crossroads.addRoute('/repository{?query}', function(query) {
    app.path(query.path);
    app.content(new PathViewModel(app, query.path));
})


//setup hasher
function parseHash(newHash, oldHash){
  crossroads.parse(newHash);
}
hasher.initialized.add(parseHash); //parse initial hash
hasher.changed.add(parseHash); //parse hash changes


function browseTo(path) {
    hasher.setHash(path);
}

hasher.init();

$(document).ready(function() {
    $().dndPageScroll(); // Automatic page scrolling on drag-n-drop: http://www.planbox.com/blog/news/updates/html5-drag-and-drop-scrolling-the-page.html
});
