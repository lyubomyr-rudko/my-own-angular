/* jshint globalstrict: true */
/* global _: false */
'use strict'; 

function Scope() {
  this.$$watchers = [];
}

var initialValue = {};
var emptyFn = function () {};

Scope.prototype.$watch = function (watchFn, listenerFn) {
  this.$$watchers.push({
    watchFn: watchFn,
    listenerFn: listenerFn || emptyFn,
    last: initialValue
  });
};

Scope.prototype.$$digestOnce = function() { 
  var self = this;
  var dirty = false;

  _.forEach(this.$$watchers, function(watcher) {
    var newValue, oldValue; 

    newValue = watcher.watchFn(self); 
    oldValue = watcher.last;
  
    if (newValue !== oldValue) {
      watcher.last = newValue;

      watcher.listenerFn(newValue, (oldValue === initialValue ? newValue : oldValue), self);
      dirty = true;
    }
  });

  return dirty;
};

Scope.prototype.$digest = function () {
  var dirty, ttl = 10;

  do {
    dirty = this.$$digestOnce();

    if (dirty && !(--ttl)) {
      throw "10 digest reached";
    }

  } while(dirty);
};
