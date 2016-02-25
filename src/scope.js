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
  this.$$children = [];
  this.$root = this;
}

var initialValue = {};
var emptyFn = function () {};

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
  var self = this,
    watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || emptyFn,
    last: initialValue,
    valueEq: !!valueEq
  };

  this.$$watchers.unshift(watcher);
  this.$root.$$lastDirtyWatch = null;

  return function () {
    var index = self.$$watchers.indexOf(watcher);
    if (index >= 0) {
      self.$$watchers.splice(index, 1);
      self.$root.$$lastDirtyWatch = null;
    }
  };
};

// Scope.prototype.$watchGroup = function (watchFns, listenerFn) {
//   return this.$watch(function () {
//     var args = arguments, self = this;

//     var res =  _.map(watchFns, function (watchFn) {
//       return watchFn.apply(self, args);
//     });

//     return res;
//   }, listenerFn, true);
// };

Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
  var self = this;
  var oldValues = new Array(watchFns.length);
  var newValues = new Array(watchFns.length);
  var changeReactionScheduled = false;
  var firstRun = true;

  if (watchFns.length === 0) {
    var shouldCall = true;

    self.$evalAsync(function() {
      listenerFn(newValues, newValues, self);
    });

    return function () {
      shouldCall = false;
    };
  }

  function watchGroupListener() {
    if (firstRun) {
      firstRun = false;
      listenerFn(newValues, newValues, self);
    } else {
      listenerFn(newValues, oldValues, self);
    }

    changeReactionScheduled = false;
  }

  var destroyFunctions = _.map(watchFns, function(watchFn, i) {
    return self.$watch(watchFn, function(newValue, oldValue) {
      newValues[i] = newValue;
      oldValues[i] = oldValue;
      if (!changeReactionScheduled) {
        changeReactionScheduled = true;
        self.$evalAsync(watchGroupListener);
      }
    });
  });

  return function () {
    _.each(destroyFunctions, function (destroyFunction) {
      destroyFunction();
    });
  };
};

Scope.prototype.$$digestOnce = function() {
  var self = this;
  var dirty = false;

  this.$$everyScope(function(scope) {
    var continueLoop = true;

    _.forEachRight(scope.$$watchers, function(watcher) {
      var newValue, oldValue; 

      try {
        if (watcher) { 
          newValue = watcher.watchFn(scope);
          oldValue = watcher.last;
        
          if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
            self.$root.$$lastDirtyWatch = watcher;
            watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
            watcher.listenerFn(newValue, (oldValue === initialValue ? newValue : oldValue), scope);
            dirty = true;
          } else if (watcher === self.$root.$$lastDirtyWatch) {
            continueLoop = false;

            return false;
          }
        }
      } catch(e) {
        console.error(e);
      }
    });

    return continueLoop;
  });

  return dirty;
};

Scope.prototype.$digest = function () {
  var dirty, ttl = 10;
  var self = this;
  
  this.$root.$$lastDirtyWatch = null;
  this.$beginePhase('$digest');

  if (this.$root.$$applyAsyncId) { 
    clearTimeout(this.$root.$$applyAsyncId); 
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
    this.$root.$digest();
  }
};

Scope.prototype.$evalAsync = function (expr) {
  var self = this;

  if (!this.$$phase && !self.$$asyncQueue.length) {
    setTimeout(function() {
      if (self.$$asyncQueue.length) {
        self.$root.$digest();
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

  if (self.$root.$$applyAsyncId) {
    return;
  }

  self.$root.$$applyAsyncId = setTimeout(function() { 
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

  this.$root.$$applyAsyncId = null; 
};

Scope.prototype.$$postDigest = function (expr) {
  this.$$postDigestQueue.push(expr);
};

Scope.prototype.$new = function (isolated, hierarchyParent) {
  var childScope;
  var parent = hierarchyParent || this;

  if (isolated) {
    childScope = new Scope(); 
    childScope.$root = parent.$root;
    childScope.$$asyncQueue = parent.$$asyncQueue;
    childScope.$$postDigestQueue = parent.$$postDigestQueue;
    childScope.$$applyAsyncQueue = parent.$$applyAsyncQueue;
  } else {
    childScope = Object.create(this);
  }

  // Scope.call(childScope);
  childScope.$$watchers = [];
  childScope.$$children = [];

  parent.$$children.push(childScope);
  childScope.$parent = parent;

  return childScope;
};

Scope.prototype.$$everyScope = function(fn) {
  // if (fn(this)) {
  //   return this.$$children.every(function(child) {
  //     return child.$$everyScope(fn);
  //   });
  // } else {
  //   return false;
  // }

  return fn(this) && this.$$children.every(function(child) {
    return child.$$everyScope(fn);
  });
};

Scope.prototype.$destroy = function() {
  if (this.$parent) {
    var siblings = this.$parent.$$children;
    var indexOfThis = siblings.indexOf(this);
    if (indexOfThis >= 0) {
      siblings.splice(indexOfThis, 1);
    }
  }
  this.$$watchers = null;
};

Scope.prototype.$watchCollection = function(watchFn, listenerFn) {
  var self = this;
  var newValue;
  var oldValue;
  var oldValueLength;
  var changeCount = 0;


  var internalWatchFn = function(scope) {
    var newValueLength;
    newValue = watchFn(scope);
    if (_.isObject(newValue)) {
      if (_.isArrayLike(newValue)) {
        if (!_.isArray(oldValue)) {
          changeCount += 1;
          oldValue = [];
        }
        if (oldValue.length !== newValue.length) {
          changeCount += 1;
          oldValue.length = newValue.length;
        }
        _.forEach(newValue, function (newValueItem, index) {
          if (!self.$$areEqual(newValueItem, oldValue[index], false)) {
            changeCount += 1;
            oldValue[index] = newValueItem;
          }
        });
      } else {
        if (!_.isObject(oldValue) || _.isArrayLike(oldValue)) {
          changeCount += 1;
          oldValue = {};
          oldValueLength = 0;
        }
        newValueLength = 0;
        _.forOwn(newValue, function (newValueItem, key) {
          newValueLength += 1;
          if (oldValue.hasOwnProperty(key)) {
            if (!self.$$areEqual(newValueItem, oldValue[key], false)) {
              changeCount += 1;
              oldValue[key] = newValueItem;
            }
          } else {
            changeCount += 1;
            oldValueLength += 1;
            oldValue[key] = newValueItem;
          }
        });
        if (oldValueLength > newValueLength) {
          changeCount += 1;
          _.forOwn(oldValue, function (oldValueItem, key) {
            if (!newValue.hasOwnProperty(key)) {
              oldValueLength -= 1;
              delete oldValue[key];
            }
          });
        }
      }
    } else {
      if (!self.$$areEqual(newValue, oldValue, false)) {
        changeCount += 1;
      }

      oldValue = newValue;
    }

    return changeCount;
  };

  var internalListenerFn = function() {
    listenerFn(newValue, oldValue, self);
  };

  return this.$watch(internalWatchFn, internalListenerFn);
};
