'use strict';

var fs = require('graceful-fs');
var path = require('path');
var nopt = require('nopt');

var astt = require('recast').types;
var deepClone = require('lodash.clonedeep');
var minimatch = require('minimatch');
var Promise = require('bluebird');
Promise.promisifyAll(fs);

var YuiGroup = require('./group');
var YuiModule = require('./module');
var ConfigMismatch = require('./errors').ConfigMismatch;



function globStarIfDir(filepath) {
    if (path.extname(filepath)) {
        return filepath; // not a dir
    }
    return path.join(filepath, '**');
}

function negatePattern(pattern) {
    return '!' + pattern;
}

function filesByPattern(files, pattern) {
    return files.filter(minimatch.filter(pattern));
}

function isNonPathProperty(property) {
    return astt.someField(property.value.key, function (key, val) {
        // key might be Literal or Identifier
        if (key === 'name' ||
            key === 'value') {
            // if true, halts someField
            return (
                val !== 'path' &&
                val !== 'fullpath'
            );
        }
    });
}

function isRequiresProperty(property) {
    return astt.someField(property.value.key, function (key, val) {
        // key might be Literal or Identifier
        if (key === 'name' ||
            key === 'value') {
            // if true, halts someField
            return (
                val === 'requires'
            );
        }
    });
}

function isPropertyValueArray(property) {
    var node = property.value;
    if (node.value &&
        astt.namedTypes.ArrayExpression.check(node.value)) {
        return true;
    }
}

function isNonEmptyPropertyValueArray(property) {
    if (isPropertyValueArray(property) &&
        property.value.value.elements.length > 0) {
        return true;
    }
}

function hasConfig(loaderConfig, fn) {
    var result;

    astt.visit(loaderConfig, {
        visitProperty: function (property) {
            if (!result) {
                result = fn(property);
            }

            return false; // only visit top-level properties
        }
    });

    return result;
}

function hasNonPathConfig(loaderConfig) {
    return hasConfig(loaderConfig, isNonPathProperty);
}

function hasRequiresConfig(loaderConfig) {
    return hasConfig(loaderConfig, isRequiresProperty);
}

function alphaPropertyKeys(a, b) {
    var aName = a.key.value,
        bName = b.key.value;
    if (aName > bName) {
        return 1;
    }
    if (aName < bName) {
        return -1;
    }
    return 0;
}

function alphaLiteralValues(a, b) {
    var aName = a.value,
        bName = b.value;
    if (aName > bName) {
        return 1;
    }
    if (aName < bName) {
        return -1;
    }
    return 0;
}

function filterNonPathConfig(loaderConfig) {
    var props = [];

    astt.visit(loaderConfig, {
        visitProperty: function (property) {
            if (isNonPathProperty(property)) {
                props.push(property.value);
            }

            return false; // only visit top-level properties
        }
    });

    if (props.length > 1) {
        props.sort(alphaPropertyKeys);
    }

    return astt.builders.objectExpression(props);
}

function sortPropertyArray(tree) {
    return astt.visit(tree, {
        visitProperty: function (property) {
            this.traverse(property, {
                visitArrayExpression: function (arrayExpression) {
                    arrayExpression.value.elements.sort(alphaLiteralValues);
                    return false;
                }
            });
        }
    });
}

function explode(match, indent, start, module, finish) {
    var str = [
        indent + start
    ];
    if (module) {
        str.push(indent + indent + module);
    }
    str.push(indent + finish);
    return str.join('\n');
}
explode.rx = /([ ]+)("requires": \[)(.*?)(\])/g;

function generateConfigBlock(instance, tree) {
    var str = instance.beautify(instance.generate(tree, { format: { quotes: 'double' } }));
    if ((explode.rx).test(str)) {
        str = str.replace(explode.rx, explode);
    }
    return str;
}

function testInstance(instance) {
    /*jshint validthis:true */
    var groupName,
        moduleName = instance.moduleName,
        loaderConfig = deepClone(this[moduleName]),
        metadataNode = deepClone(instance.nodes.meta),
        details;

    if (!loaderConfig) {
        console.error('WARNING: No loader config for %s', instance.rawfile);
        return;
    }

    groupName = loaderConfig.groupName;
    details = {
        groupName: groupName,
        groupFile: this.CONFIG_FILE[groupName].rawfile,
        moduleName: moduleName,
        moduleFile: instance.rawfile
    };

    if (hasNonPathConfig(loaderConfig)) {
        // inspect instance to determine action

        // filter out "path" or "fullpath" keys
        loaderConfig = filterNonPathConfig(loaderConfig);

        if (hasRequiresConfig(loaderConfig) && (
                !metadataNode ||
                !hasRequiresConfig(metadataNode) ||
                !hasConfig(metadataNode, isPropertyValueArray)
            )) {
            // write loader metadata to instance
            return instance.replaceMeta(loaderConfig);
        } else {
            // exit with error code if sorted metadata does not match
            astt.visit(metadataNode, instance._quoteIdentifierKeys);

            sortPropertyArray(metadataNode);
            sortPropertyArray(loaderConfig);

            var configBlock = generateConfigBlock(instance, filterNonPathConfig(metadataNode));
            var loaderBlock = generateConfigBlock(instance, loaderConfig);

            if (configBlock !== loaderBlock) {
                throw new ConfigMismatch(details, loaderBlock, configBlock);
            }
        }
    } else if (metadataNode && hasNonPathConfig(metadataNode)) {
        // no non-path loader config currently exists...
        if (hasConfig(metadataNode, isNonEmptyPropertyValueArray)) {
            // instance metadata needs to be propagated to loader config
            throw new ConfigMismatch(details, null, generateConfigBlock(instance, metadataNode));
        } else {
            // strip useless instance config
            return instance.deleteMeta();
        }
    }
    // otherwise, there is no non-path config or instance metadata
}

function getPackageVersion() {
    return fs.readFileAsync(path.resolve(__dirname, '..', 'package.json'))
        .then(JSON.parse)
        .get('version');
}

function getUsage() {
    var usage = [
        'TODO'
    ].join('\n');

    return Promise.resolve(usage);
}



exports.interpret = function interpret() {
    var options = nopt({
        'config': [String, Array],
        'ignore': [String, Array],
        'help': Boolean,
        'version': Boolean
    }, {
        'h': ['--help'],
        'v': ['--version']
    });

    if (options.version) {
        return getPackageVersion().tap(console.log);
    }

    if (options.help) {
        return getUsage().tap(console.log);
    }

    var configFilters = options.config.map(globStarIfDir);
    var ignoreFilters = options.ignore.map(globStarIfDir).map(negatePattern)
                                    .concat(configFilters.map(negatePattern));

    var configs = configFilters.reduce(filesByPattern, options.argv.remain);
    var modules = ignoreFilters.reduce(filesByPattern, options.argv.remain);


    // parse all configs and seed loaderConfigs hash
    var loaderConfigPromise = Promise.map(configs, function (filename) {
        return new YuiGroup(filename).promise;
    })
        .reduce(function (hash, instance) {
            Object.keys(instance.moduleConfig).forEach(function (key) {
                hash[key] = instance.moduleConfig[key];
            });

            instance.groups.forEach(function (groupName) {
                hash.CONFIG_FILE[groupName] = instance;
            });

            return hash;
        }, {
            CONFIG_FILE: {}
        });


    // parse all files, filtering YUI.add()
    var moduleInstancesPromise = Promise.map(modules, function (filename) {
        return new YuiModule(filename).promise;
    })
        .filter(function (instance) {
            return !!instance.moduleName;
        });

    // rewrite matches, injecting config blocks
    return Promise.join(loaderConfigPromise, moduleInstancesPromise, function (loaderConfigs, instances) {
        return Promise.all(instances).bind(loaderConfigs).each(testInstance);
    })
        .catch(ConfigMismatch, function (e) {
            console.warn(e.message);
            process.exit(1);
        });
};
