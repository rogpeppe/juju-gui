'use strict';

YUI.add('juju-view-service', function(Y) {

var ENTER = Y.Node.DOM_EVENTS.key.eventDef.KEY_MAP.enter;
var ESC = Y.Node.DOM_EVENTS.key.eventDef.KEY_MAP.esc;


var views = Y.namespace('juju.views'),
    Templates = views.Templates,
    models = Y.namespace('juju.models');

var BaseServiceView = Y.Base.create('BaseServiceView', Y.View, [views.JujuBaseView], {

    initializer: function() {
        console.log('View: initialized:', this.name);
        this.bindModelView();
    }

});

var ServiceRelations = Y.Base.create('ServiceRelationsView', Y.View, [views.JujuBaseView], {

    template: Templates['service-relations'],

    render: function() {
        var container = this.get('container'),
                 self = this,
                    m = this.get('domain_models');
        var service = this.get('model');
        container.setHTML(this.template(
            {'service': service.getAttrs(),
             'relations': service.get('rels'),
             'charm': this.renderable_charm(service.get('charm'), m)}
            ));
    }
});

views.service_relations = ServiceRelations;

var ServiceConstraints = Y.Base.create('ServiceConstraintsView', Y.View, [views.JujuBaseView], {

    template: Templates['service-constraints'],

    render: function() {
        var container = this.get('container'),
                 self = this,
                    m = this.get('domain_models');
        var service = this.get('model');
        var constraints = service.get('constraints');
        var display_constraints = [];

        for (var key in constraints) {
            display_constraints.push({'name': key, 'value': constraints[key]});
        }

        var generics = ['cpu', 'mem', 'arch'];
        for (var idx in generics) {
            var gkey = generics[idx];
            if (! (gkey in constraints)) {
                display_constraints.push({'name': gkey, 'value': ''});
            }
        }

        console.log('service constraints', display_constraints);
        container.setHTML(this.template(
            {'service': service.getAttrs(),
             'constraints': display_constraints,
             'charm': this.renderable_charm(service.get('charm'), m)}
            ));
    }

});

views.service_constraints = ServiceConstraints;

var ServiceConfigView = Y.Base.create('ServiceConfigView', Y.View, [views.JujuBaseView], {

    template: Templates['service-config'],

    render: function () {
        var container = this.get('container'),
                 self = this,
                    m = this.get('domain_models');
        var service = this.get('model');

        if (!service || !service.get('loaded')) {
            console.log('not connected / maybe');
            return this;
        }

        console.log('config', service.get('config'));
        var charm_url = service.get('charm');

        // combine the charm schema and the service values for display.
        var charm =  m.charms.getById(charm_url);
        var config = service.get('config');
        var schema = charm.get('config');

        var settings = [];
        var field_def;

        for (var field_name in config) {
            field_def = schema[field_name];
            settings.push(Y.mix(
                {'name': field_name, 'value': config[field_name]}, field_def));
        }

        console.log('render view svc config', service.getAttrs(), settings);

        container.setHTML(this.template(
            {'service': service.getAttrs(),
             'settings': settings,
             'charm': this.renderable_charm(service.get('charm'), m)}
            ));
    }
});

views.service_config = ServiceConfigView;

var ServiceView = Y.Base.create('ServiceView', Y.View, [views.JujuBaseView], {

    template: Templates.service,

    render: function () {
        var container = this.get('container'),
                   db = this.get('db'),
              service = this.get('model'),
                  env = this.get('env');

        if (!service) {
            console.log('not connected / maybe');
            return this;
        }
        var units = db.units.get_units_for_service(service);
        var charm_name = service.get('charm');
        container.setHTML(this.template(
            {'service': service.getAttrs(),
             'charm': this.renderable_charm(charm_name, db),
             'units': units.map(function(u) {
                 return u.getAttrs();})
        }));
        return this;
    },

    events: {
        '#num-service-units': {keydown: 'modifyUnits', blur: 'resetUnits'},
        'div.thumbnail': {click: function(ev) {
            console.log('Unit clicked', ev.currentTarget.get('id'));
            this.fire('showUnit', {unit_id: ev.currentTarget.get('id')});
        }},
        '.unExposeService': {click: 'unExposeService'},
        '.exposeService': {click: 'exposeService'}
    },

    unExposeService: function() {

    },

    exposeService: function() {
        var service = this.get('service'),
            env = this.get('env'),
            db = this.get('db');

        env.expose(service.get('name'), function() {
            db.fire('update');
        });
    },

    resetUnits: function(ev) {
        var container = this.get('container'),
            field = container.one('#num-service-units');
        field.set('value', this.get('model').get('unit_count'));
    },

    modifyUnits: function (ev) {
        if (ev.keyCode != ESC && ev.keyCode != ENTER) {
            return;
        }
        var container = this.get('container'),
            field = container.one('#num-service-units');
        if (ev.keyCode == ESC) {
            field.set('value', this.get('model').get('unit_count'));
        }
        if (ev.keyCode != ENTER) { // If not Enter keyup...
            return;
        }
        ev.halt(true);
        this._modifyUnits(parseInt(field.get('value'), 10));
    },

    _modifyUnits: function(requested_unit_count) {

        var service = this.get('model'),
            unit_count = service.get('unit_count'),
            field = this.get('container').one('#num-service-units'),
            env = this.get('env');

        if (requested_unit_count < 1) {
            console.log('You must have at least one unit');
            field.set('value', unit_count);
            return;
        }

        var delta = requested_unit_count - unit_count;
        if (delta > 0) {
            // Add units!
            env.add_unit(
                service.get('id'), delta,
                Y.bind(this._addUnitCallback, this));
        } else if (delta < 0) {
            delta = Math.abs(delta);
            var db = this.get('db'),
                units = db.units.get_units_for_service(service),
                unit_ids_to_remove = [];

            for (var i=units.length - 1;
                 unit_ids_to_remove.length < delta;
                 i--) {
                unit_ids_to_remove.push(units[i].get('id'));
            }
            env.remove_units(
                unit_ids_to_remove,
                Y.bind(this._removeUnitCallback, this)
                );
        }
        field.set('disabled', true);
    },

    _addUnitCallback: function(ev) {
        var service = this.get('model'),
            service_id = service.get('id'),
            db = this.get('db'),
            unit_names = ev.result || [];
        console.log('_addUnitCallback with: ', arguments);
        // Received acknowledgement message for the 'add_units' operation.
        // ev.results is an array of the new unit ids to be created.
        db.units.add(
            Y.Array.map(unit_names, function (unit_id) {
                return new models.ServiceUnit(
                    {id: unit_id,
                     agent_state: 'pending',
                     service: service_id});
            }));
        service.set(
            'unit_count', service.get('unit_count') + unit_names.length);
        db.fire('update');
        // View is redrawn so we do not need to enable field.
    },

    _removeUnitCallback: function(ev) {
        var service = this.get('model'),
            db = this.get('db'),
            unit_names = ev.unit_names;
        console.log('_removeUnitCallback with: ', arguments);
        Y.Array.each(unit_names, function(unit_name) {
            db.units.remove(db.units.getById(unit_name));
        });
        service.set(
            'unit_count', service.get('unit_count') - unit_names.length);
        db.fire('update');
        // View is redrawn so we do not need to enable field.
    }
});

views.service = ServiceView;
}, '0.1.0', {
    requires: ['juju-view-utils',
               'juju-models',
               'base-build',
               'handlebars',
               'node',
               'view',
               'event-key',
               'json-stringify']
});
