/* jshint globalstrict: true */
/* global _: false, setTimeout: false */
'use strict'; 

function Scope() {
  this.$$watchers = [];
  this.$$asyncQueue = [];
  this.$$lastDirtyWatch = null;
  this.$$phase = null;
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
  });

  return dirty;
};

Scope.prototype.$digest = function () {
  var dirty, ttl = 10;
  var self = this;
  
  this.$$lastDirtyWatch = null;
  this.$beginePhase('$digest');
  do {
    while(this.$$asyncQueue.length) {
      var asyncTask = this.$$asyncQueue.shift();

      asyncTask.scope.$eval(asyncTask.expression);
    }

    dirty = this.$$digestOnce();

    if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
      this.$clearPhase();
      throw "10 digest reached";
    }

  } while(dirty || this.$$asyncQueue.length);

  this.$clearPhase();
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
