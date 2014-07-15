'use strict';

module.exports = YuiGroup;

var recast = require('recast');
var b = recast.types.builders;
var n = recast.types.namedTypes;
var inherits = require('inherits');
var BaseImporter = require('./base-importer');


inherits(YuiGroup, BaseImporter);
function YuiGroup(file) {
    if (!(this instanceof YuiGroup)) {
        return new YuiGroup(file);
    }

    BaseImporter.call(this, file);
}

YuiGroup.prototype.visit = function (tree) {
    var instanceModules = this.nodes.modules = [];

    recast.visit(tree, {
        visitAssignmentExpression: function (currentPath) {
            var node = currentPath.node,
                groupModules,
                groupName;

            if (n.MemberExpression.check(node.left) &&
                n.ObjectExpression.check(node.right) &&
                node.left.object.object.property.name === 'GlobalConfig' &&
                node.left.object.property.name === 'groups') {

                // YUI.GlobalConfig.groups.<groupName> = {...}
                groupName = node.left.property.name;

                // retrieve an ObjectExpression of module config blocks for this group
                groupModules = node.right.properties
                    .filter(function (prop) {
                        return (prop.key.name || prop.key.value) === 'modules' &&
                            n.ObjectExpression.check(prop.value);
                    })
                    .map(function (prop) {
                        return prop.value;
                    })
                    .pop();

                if (groupModules) {
                    instanceModules.push(
                        b.property(
                            'init',
                            b.literal(groupName),
                            groupModules
                        )
                    );
                }

                return false; // don't visit deeper
            }

            this.traverse(currentPath);
        }
    });

    this._mapModuleNames(instanceModules);

    return tree;
};

YuiGroup.prototype._getters = {
    modules: function () {
        return this.cached.modules || this.nodes.modules && (
            this.cached.modules = this.beautify(this.generate(
                b.objectExpression(
                    this.nodes.modules
                ),
                { format: { quotes: 'double' } }
            ))
        );
    }
};

YuiGroup.prototype._mapModuleNames = function (modules) {
    var moduleConfig = {},
        groups = [];

    if (modules) {
        this.quoteIdentifierKeys(modules);

        recast.types.eachField(modules, function (_, topLevelNode) {
            var groupName = topLevelNode.key.value;

            // moduleName => moduleConfig ObjectExpression
            recast.types.eachField(topLevelNode.value.properties, function (_, propNode) {
                var moduleName = propNode.key.value,
                    moduleConfNode = propNode.value;

                moduleConfNode.groupName = groupName; // retain indirect association
                moduleConfig[moduleName] = moduleConfNode;
            });

            groups.push(groupName);
        });
    }

    Object.defineProperties(this, {
        groups: {
            value: groups
        },
        moduleConfig: {
            value: moduleConfig
        }
    });
};
