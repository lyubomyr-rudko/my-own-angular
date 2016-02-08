/* jshint globalstrict: true */
/* global _: false, setTimeout: false, clearTimeout: false, console: false */
'use strict'; 

function Scope() {
  this.$$watchers = [];
  this.$$asyncQueue = [];
  this.$$lastDirtyWatch = null;
  this.$$phase = null;
  this.$$applyAsyncQueue = [];
  this.$$applyAsyncId = null;
  this.$$postDigestQueue = [];
}

var initialValue = {};
var emptyFn = function () {};

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
  this.$$watchers.push({
    watchFn: watchFn,
    listenerFn: listenerFn || emptyFn,
    last: initialValue,
    valueEq: !!valueEq
  });
  this.$$lastDirtyWatch = null;
};

Scope.prototype.$$digestOnce = function() { 
  var self = this;
  var dirty = false;

  _.forEach(this.$$watchers, function(watcher) {
    var newValue, oldValue; 
    try {
      newValue = watcher.watchFn(self); 
      oldValue = watcher.last;
    
      if (!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
        self.$$lastDirtyWatch = watcher;
        watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
        watcher.listenerFn(newValue, (oldValue === initialValue ? newValue : oldValue), self);
        dirty = true;

      } else if (watcher === self.$$lastDirtyWatch) {
        return false;
      }
    } catch(e) {
      console.error(e);
    }
  });

  return dirty;
};

Scope.prototype.$digest = function () {
  var dirty, ttl = 10;
  var self = this;
  
  this.$$lastDirtyWatch = null;
  this.$beginePhase('$digest');

  if (this.$$applyAsyncId) { 
    clearTimeout(this.$$applyAsyncId); 
    this.$$flushApplyAsync();
  }

  do {
    while(this.$$asyncQueue.length) {
      var asyncTask = this.$$asyncQueue.shift();
      try {
        asyncTask.scope.$eval(asyncTask.expression);
      } catch (e) {
        console.error(e);
      }
    }

    dirty = this.$$digestOnce();

    if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
      this.$clearPhase();
      throw "10 digest reached";
    }

  } while(dirty || this.$$asyncQueue.length);

  this.$clearPhase();

  while (this.$$postDigestQueue.length) { 
    try {
      this.$$postDigestQueue.shift()();
    } catch (e) {
      console.error(e);
    }
  }
};

Scope.prototype.$beginePhase = function (phase) {
  if (this.$$phase) {
    throw this.$$phase + ' is allready in progress';
  }

  this.$$phase = phase;
};

Scope.prototype.$clearPhase = function () {
  this.$$phase = null;
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) { 
  if (valueEq) {
    return _.isEqual(newValue, oldValue); 
  } else {
    return (newValue === oldValue) ||  (typeof oldValue === 'number' && typeof newValue === 'number' && isNaN(newValue) && isNaN(oldValue)); 
  }
};

Scope.prototype.$eval = function (cb, param) {
  return cb(this, param);
}; 

Scope.prototype.$apply = function (cb) {
  try {
    this.$beginePhase('$apply');
    this.$eval(cb);
  } finally {
    this.$clearPhase();
    this.$digest();
  }
};

Scope.prototype.$evalAsync = function (expr) {
  var self = this;

  if (!this.$$phase && !self.$$asyncQueue.length) {
    setTimeout(function() {
      if (self.$$asyncQueue.length) {
        self.$digest();
      }
    }, 0);
  }

  this.$$asyncQueue.push({scope: this, expression: expr});
};

Scope.prototype.$applyAsync = function (cb) {
  var self = this;

  self.$$applyAsyncQueue.push(function () {
    self.$eval(cb);
  });

  if (self.$$applyAsyncId) {
    return;
  }

  self.$$applyAsyncId = setTimeout(function() { 
    self.$apply(_.bind(self.$$flushApplyAsync, self));
  }, 0);
};

Scope.prototype.$$flushApplyAsync = function() { 
  while (this.$$applyAsyncQueue.length) {
    try {
      this.$$applyAsyncQueue.shift()(); 
    } catch (e) {
      console.error(e);
    }
  }

  this.$$applyAsyncId = null; 
};

Scope.prototype.$$postDigest = function (expr) {
  this.$$postDigestQueue.push(expr);
};
