'use strict';

module.exports = decorator;

var YuiModule = require('./lib/module');
var YuiGroup  = require('./lib/group');

function decorator(file, context, callback) {
    context = context || {};
    return new YuiModule(file).promise
        .then(function (instance) {
            // only apply "own" (enumerable) properties to context
            Object.keys(instance).forEach(function (prop) {
                context[prop] = instance[prop];
            });

            return context;
        })
        .nodeify(callback);
}

decorator.module = YuiModule;
decorator.group = YuiGroup;
