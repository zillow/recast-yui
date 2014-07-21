'use strict';

module.exports = BaseImporter;

var fs = require('graceful-fs');
var path = require('path');

var recast = require('recast');
var esprima = require('esprima');
var escodegen = require('escodegen');
var jsbeautify = require('js-beautify');

var Promise = require('bluebird');
Promise.promisifyAll(fs);


function BaseImporter(file, options) {
    this.options = options || {};

    // prevent enumeration of various properties
    Object.defineProperties(this, {
        promise: { writable: true },
        rawfile: { writable: true },
        rawcode: { writable: true },
        nodes: {
            value: {}
        },
        cached: {
            value: {}
        }
    });

    // enumerable getters
    for (var prop in this._getters) {
        Object.defineProperty(this, prop, {
            enumerable: true,
            get: this._getters[prop]
        });
    }

    this.promise = Promise.resolve(file).bind(this)
        .then(this._read)
        .then(this._parse)
        .then(this.visit)
        .catch(this._warn)
        .return(this);
}

BaseImporter.prototype._read = function (rawfile) {
    this.rawfile = rawfile;
    return fs.readFileAsync(path.resolve(rawfile), 'utf8');
};

BaseImporter.prototype._write = function (code) {
    if (this.options.dryRun !== true) {
        return fs.writeFileAsync(path.resolve(this.rawfile), code);
    } else {
        return Promise.resolve(this);
    }
};

BaseImporter.prototype._parse = function (rawcode) {
    this.rawcode = rawcode;
    // recast.parse() is an order of magnitude slower than esprima.parse() :P
    // return recast.parse(rawcode, {
    //     // sourceFileName: path.basename(this.rawfile),
    //     // sourceMapName: path.basename(this.rawfile, path.extname(this.rawfile)) + '.map',
    //     // sourceRoot: path.dirname(this.rawfile),
    //     range: true
    // });
    return esprima.parse(rawcode, { range: true });
};

BaseImporter.prototype._warn = function (ex) {
    console.warn(ex);
};

BaseImporter.prototype._getters = {};

BaseImporter.prototype.visit = function (tree) {
    return tree;
};

BaseImporter.prototype.generate = function (tree, config) {
    return escodegen.generate(tree, config);
};

BaseImporter.prototype.beautify = function (code, config) {
    return jsbeautify(code, config || {
        'jslint_happy': true,
        'keep_array_indentation': true
    });
};

BaseImporter.prototype.quoteIdentifierKeys = function (tree) {
    return recast.visit(tree, this._quoteIdentifierKeys);
};

BaseImporter.prototype._quoteIdentifierKeys = {
    visitProperty: function (property) {
        this.traverse(property, {
            visitIdentifier: function (identifier) {
                if (identifier.name === 'key') {
                    return recast.types.builders.literal(identifier.node.name);
                }
                return false;
            }
        });
    }
};
