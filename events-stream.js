define("events-stream", function () {

  function EventEmitter() {}

  EventEmitter.prototype.on = function (name, callback) {
    if (!this.hasOwnProperty("_handlers")) this._handlers = {};
    var handlers = this._handlers;
    if (!handlers.hasOwnProperty(name)) handlers[name] = [];
    var list = handlers[name];
    list.push(callback);
  };
  EventEmitter.prototype.addListener = EventEmitter.prototype.on;

  EventEmitter.prototype.once = function (name, callback) {
    this.on(name, callback);
    this.on(name, remove);
    function remove() {
      this.off(name, callback);
      this.off(name, remove);
    }
  };

  EventEmitter.prototype.emit = function (name/*, args...*/) {
    if (!this.hasOwnProperty("_handlers")) return;
    var handlers = this._handlers;
    if (!handlers.hasOwnProperty(name)) return;
    var list = handlers[name];
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0, l = list.length; i < l; i++) {
      if (!list[i]) continue;
      list[i].apply(this, args);
    }
  };

  EventEmitter.prototype.off = function (name, callback) {
    if (!this.hasOwnProperty("_handlers")) return;
    var handlers = this._handlers;
    if (!handlers.hasOwnProperty(name)) return;
    var list = handlers[name];
    var index = list.indexOf(callback);
    if (index < 0) return;
    list[index] = false;
    if (index === list.length - 1) {
      while (index >= 0 && !list[index]) {
        list.length--;
        index--;
      }
    }
  };

  EventEmitter.prototype.removeListener = EventEmitter.prototype.off;

  EventEmitter.prototype.removeAllListeners = function (event) {
    if (arguments.length > 0 && this._handlers) {
      delete this._handlers[event];
      return;
    }
    delete this._handlers;
  };

  function Stream() {}

  Stream.prototype = Object.create(EventEmitter.prototype, {constructor: {value: Stream}});

  Stream.prototype.pipe = function(dest, options) {
    var source = this;

    function ondata(chunk) {
      if (dest.writable) {
        if (false === dest.write(chunk) && source.pause) {
          source.pause();
        }
      }
    }

    source.on('data', ondata);

    function ondrain() {
      if (source.readable && source.resume) {
        source.resume();
      }
    }

    dest.on('drain', ondrain);

    // If the 'end' option is not supplied, dest.end() will be called when
    // source gets the 'end' or 'close' events.  Only dest.end() once, and
    // only when all sources have ended.
    if (!dest._isStdio && (!options || options.end !== false)) {
      dest._pipeCount = dest._pipeCount || 0;
      dest._pipeCount++;

      source.on('end', onend);
      source.on('close', onclose);
    }

    var didOnEnd = false;
    function onend() {
      if (didOnEnd) return;
      didOnEnd = true;

      dest._pipeCount--;

      // remove the listeners
      cleanup();

      if (dest._pipeCount > 0) {
        // waiting for other incoming streams to end.
        return;
      }

      dest.end();
    }


    function onclose() {
      if (didOnEnd) return;
      didOnEnd = true;

      dest._pipeCount--;

      // remove the listeners
      cleanup();

      if (dest._pipeCount > 0) {
        // waiting for other incoming streams to end.
        return;
      }

      dest.destroy();
    }

    // don't leave dangling pipes when there are errors.
    function onerror(er) {
      cleanup();
      if (this.listeners('error').length === 0) {
        throw er; // Unhandled stream error in pipe.
      }
    }

    source.on('error', onerror);
    dest.on('error', onerror);

    // remove all the event listeners that were added.
    function cleanup() {
      source.removeListener('data', ondata);
      dest.removeListener('drain', ondrain);

      source.removeListener('end', onend);
      source.removeListener('close', onclose);

      source.removeListener('error', onerror);
      dest.removeListener('error', onerror);

      source.removeListener('end', cleanup);
      source.removeListener('close', cleanup);

      dest.removeListener('end', cleanup);
      dest.removeListener('close', cleanup);
    }

    source.on('end', cleanup);
    source.on('close', cleanup);

    dest.on('end', cleanup);
    dest.on('close', cleanup);

    dest.emit('pipe', source);

    // Allow for unix-like usage: A.pipe(B).pipe(C)
    return dest;
  };


  return {
    EventEmitter: EventEmitter,
    Stream: Stream
  };

});