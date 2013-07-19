/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2012-2013 Canonical Ltd.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License version 3, as published by
the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranties of MERCHANTABILITY,
SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';


/**
 * Provide code for the ServiceInpsector bits.
 *
 * @module views
 * @submodule views.inspector
 */

YUI.add('juju-view-inspector', function(Y) {
  var ENTER = Y.Node.DOM_EVENTS.key.eventDef.KEY_MAP.enter;
  var ESC = Y.Node.DOM_EVENTS.key.eventDef.KEY_MAP.esc;

  var views = Y.namespace('juju.views'),
      Templates = views.Templates,
      models = Y.namespace('juju.models'),
      plugins = Y.namespace('juju.plugins'),
      utils = Y.namespace('juju.views.utils'),
      viewletNS = Y.namespace('juju.viewlets'),
      ns = Y.namespace('juju.views.inspector');

  /**
   * @class manageUnitsMixin
   */
  ns.manageUnitsMixin = {
    // Mixin attributes
    // XXX Makyo - this will need to be removed when the serviceInspector flag
    // goes away.
    events: {
      '.num-units-control': {
        keydown: 'modifyUnits',
        blur: 'resetUnits'
      }
    },

    /*
     * XXX Makyo - all instances of testing for the flag will go away once
     * the inspector becomes the default, rather than internal pages.
     */
    /**
     * No-Op function to replace getModelURL for the time being.
     * XXX Makyo - remove when inspector becomes the default.
     *
     * @method noop
     * @return {undefined} Nothing.
     */
    noop: function() { return; },

    resetUnits: function() {
      var container, model, flags = window.flags;
      if (flags.serviceInspector) {
        container = this.inspector.get('container');
        model = this.inspector.get('model');
      } else {
        container = this.get('container');
        model = this.get('model');
      }
      var field = container.one('.num-units-control');
      field.set('value', model.get('unit_count'));
      field.set('disabled', false);
    },

    modifyUnits: function(ev) {
      if (ev.keyCode !== ESC && ev.keyCode !== ENTER) {
        return;
      }
      var container, flags = window.flags;
      if (flags.serviceInspector) {
        container = this.inspector.get('container');
      } else {
        container = this.get('container');
      }
      var field = container.one('.num-units-control');

      if (ev.keyCode === ESC) {
        this.resetUnits();
      }
      if (ev.keyCode !== ENTER) { // If not Enter keyup...
        return;
      }
      ev.halt(true);

      if (/^\d+$/.test(field.get('value'))) {
        this._modifyUnits(parseInt(field.get('value'), 10));
      } else {
        this.resetUnits();
      }
    },

    _modifyUnits: function(requested_unit_count) {
      var container, env, flags = window.flags;
      if (flags.serviceInspector) {
        container = this.inspector.get('container');
        env = this.inspector.get('env');
      } else {
        container = this.get('container');
        env = this.get('env');
      }
      var service = this.model || this.get('model');
      var unit_count = service.get('unit_count');
      var field = container.one('.num-units-control');

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
        var db;
        if (flags.serviceInspector) {
          db = this.inspector.get('db');
        } else {
          db = this.get('db');
        }
        var units = db.units.get_units_for_service(service),
            unit_ids_to_remove = [];

        for (var i = units.length - 1;
            unit_ids_to_remove.length < delta;
            i -= 1) {
          unit_ids_to_remove.push(units[i].id);
        }
        env.remove_units(
            unit_ids_to_remove,
            Y.bind(this._removeUnitCallback, this)
        );
      }
      field.set('disabled', true);
    },

    _addUnitCallback: function(ev) {
      var service, getModelURL, db, flags = window.flags;
      if (flags.serviceInspector) {
        service = this.inspector.get('model');
        getModelURL = this.noop;
        db = this.inspector.get('db');
      } else {
        service = this.get('model');
        getModelURL = this.get('getModelURL');
        db = this.get('db');
      }
      var unit_names = ev.result || [];
      if (ev.err) {
        db.notifications.add(
            new models.Notification({
              title: 'Error adding unit',
              message: ev.num_units + ' units',
              level: 'error',
              link: getModelURL(service),
              modelId: service
            })
        );
      } else {
        db.units.add(
            Y.Array.map(unit_names, function(unit_id) {
              return {id: unit_id,
                agent_state: 'pending'};
            }));
        service.set(
            'unit_count', service.get('unit_count') + unit_names.length);
      }
      db.fire('update');
      // View is redrawn so we do not need to enable field.
    },

    _removeUnitCallback: function(ev) {
      var service, getModelURL, db, flags = window.flags;
      if (flags.serviceInspector) {
        service = this.inspector.get('model');
        getModelURL = this.noop;
        db = this.inspector.get('db');
      } else {
        service = this.get('model');
        getModelURL = this.get('getModelURL');
        db = this.get('db');
      }
      var unit_names = ev.unit_names;

      if (ev.err) {
        db.notifications.add(
            new models.Notification({
              title: (function() {
                if (!ev.unit_names || ev.unit_names.length < 2) {
                  return 'Error removing unit';
                }
                return 'Error removing units';
              })(),
              message: (function() {
                if (!ev.unit_names || ev.unit_names.length === 0) {
                  return '';
                }
                if (ev.unit_names.length > 1) {
                  return 'Unit names: ' + ev.unit_names.join(', ');
                }
                return 'Unit name: ' + ev.unit_names[0];
              })(),
              level: 'error',
              link: getModelURL(service),
              modelId: service
            })
        );
      } else {
        Y.Array.each(unit_names, function(unit_name) {
          db.units.remove(db.units.getById(unit_name));
        });
        service.set(
            'unit_count', service.get('unit_count') - unit_names.length);
      }
      db.fire('update');
      // View is redrawn so we do not need to enable field.
    }
  };

  /**
   * @class exposeButtonMixin
   */
  ns.exposeButtonMixin = {
    events: {
      '.unexposeService': {mousedown: 'unexposeService'},
      '.exposeService': {mousedown: 'exposeService'}
    },

    /**
     * Unexpose the service stored in this view.
     * Pass this._unexposeServiceCallback as callback to be called when
     * the response is returned by the backend.
     *
     * @method unexposeService
     * @return {undefined} Nothing.
     */
    unexposeService: function() {
      var svcInspector = window.flags && window.flags.serviceInspector;
      var dataSource = svcInspector ? this.inspector : this;
      var service = dataSource.get('model'),
          env = dataSource.get('env');
      env.unexpose(service.get('id'),
          Y.bind(this._unexposeServiceCallback, this));
    },

    /**
     * Callback called when the backend returns a response to a service
     * unexpose call. Update the service model instance or, if an error
     * occurred, add a failure notification.
     *
     * @method _unexposeServiceCallback
     * @param {Object} ev An event object (with "err" and "service_name"
     *  attributes).
     * @return {undefined} Nothing.
     */
    _unexposeServiceCallback: function(ev) {
      var service = this.get('model'),
          db = this.get('db'),
          getModelURL = this.get('getModelURL');
      if (ev.err) {
        db.notifications.add(
            new models.Notification({
              title: 'Error un-exposing service',
              message: 'Service name: ' + ev.service_name,
              level: 'error',
              link: getModelURL(service),
              modelId: service
            })
        );
      } else {
        service.set('exposed', false);
        db.fire('update');
      }
    },

    /**
     * Expose the service stored in this view.
     * Pass this._exposeServiceCallback as callback to be called when
     * the response is returned by the backend.
     *
     * @method exposeService
     * @return {undefined} Nothing.
     */
    exposeService: function() {
      var svcInspector = window.flags && window.flags.serviceInspector;
      var dataSource = svcInspector ? this.inspector : this;
      var service = dataSource.get('model'),
          env = dataSource.get('env');
      env.expose(service.get('id'),
          Y.bind(this._exposeServiceCallback, this));
    },

    /**
     * Callback called when the backend returns a response to a service
     * expose call. Update the service model instance or, if an error
     * occurred, add a failure notification.
     *
     * @method _exposeServiceCallback
     * @param {Object} ev An event object (with "err" and "service_name"
     *  attributes).
     * @return {undefined} Nothing.
     */
    _exposeServiceCallback: function(ev) {
      var service = this.get('model'),
          db = this.get('db'),
          getModelURL = this.get('getModelURL');
      if (ev.err) {
        db.notifications.add(
            new models.Notification({
              title: 'Error exposing service',
              message: 'Service name: ' + ev.service_name,
              level: 'error',
              link: getModelURL(service),
              modelId: service
            })
        );
      } else {
        service.set('exposed', true);
        db.fire('update');
      }
    }
  };



  /**
    A collection of methods and properties which will be mixed into the
    prototype of the view container controller to add the functionality for
    the ghost inspector interactions.

    @property serviceInspector
    @submodule juju.controller
    @type {Object}
  */
  Y.namespace('juju.controller').serviceInspector = {
    'getName': function() {
      return this.inspector.getName();
    },
    'bind': function(model, viewlet) {
      this.inspector.bindingEngine.bind(model, viewlet);
      return this;
    },
    'render': function() {
      this.inspector.render();
      return this;
    },

    /**
      Handles showing/hiding the configuration settings descriptions.

      @method toggleSettingsHelp
      @param {Y.EventFacade} e An event object.
    */
    toggleSettingsHelp: function(e) {
      var button = e.currentTarget,
          descriptions = e.container.all('.settings-description'),
          btnString = 'Hide settings help';

      if (e.currentTarget.getHTML().indexOf('Hide') < 0) {
        button.setHTML(btnString);
        descriptions.show();
      } else {
        button.setHTML('Show settings help');
        descriptions.hide();
      }
    },

    /**
      Display the "do you really want to destroy this service?" prompt.

      @method showDestroyPrompt
      @param {Y.Node} container The container of the prompt.
    */
    showDestroyPrompt: function(container) {
      container.one('.destroy-service-prompt').removeClass('closed');
    },

    /**
      Hide the "do you really want to destroy this service?" prompt.

      @method hideDestroyPrompt
      @param {Y.Node} container The container of the prompt.
    */
    hideDestroyPrompt: function(container) {
      container.one('.destroy-service-prompt').addClass('closed');
    },

    /**
      Start the process of destroying the service represented by this
      inspector.

      @method initiateServiceDestroy
      @return {undefined} Nothing.
    */
    initiateServiceDestroy: function() {
      var svcInspector = window.flags && window.flags.serviceInspector;
      // When the above flag is removed we won't need the dataSource variable
      // any more and can refactor this accordingly.
      var dataSource = svcInspector ? this.inspector : this;
      var model = dataSource.get('model');
      var db = this.inspector.get('db');
      if (model.name === 'service') {
        var env = dataSource.get('env');
        env.destroy_service(model.get('id'),
            Y.bind(this._destroyServiceCallback, this, model, db));
      } else if (model.name === 'charm') {
        db.services.remove(this.options.ghostService);
      } else {
        throw new Error('Unexpected model type: ' + model.name);
      }
    },

    /**
      React to a service being destroyed (or not).

      @method _destroyServiceCallback
      @param {Object} service The service we attempted to destroy.
      @param {Object} db The database responsible for storing the service.
      @param {Object} evt The event describing the destruction (or lack
        thereof).
    */
    _destroyServiceCallback: function(service, db, evt) {
      if (evt.err) {
        // If something bad happend we need to alert the user.
        db.notifications.add(
            new models.Notification({
              title: 'Error destroying service',
              message: 'Service name: ' + evt.service_name,
              level: 'error',
              link: undefined, // XXX See note below about getModelURL.
              modelId: service
            })
        );
      } else {
        // If the removal succeeded on the server side, we need to remove the
        // service from the database.  (Why wouldn't we get an update from the
        // server side that would do this for us?).
        db.services.remove(service);
        db.relations.remove(db.relations.filter(
            function(r) {
              return Y.Array.some(r.get('endpoints'), function(ep) {
                return ep[0] === service.get('id');
              });
            }));
      }
    },

    /* Event handlers for service/ghost destroy UI */

    /**
      React to the user clicking on or otherwise activating the "destroy this
      service" icon.

      @method onDestroyIcon
      @param {Object} evt The event data.
      @return {undefined} Nothing.
    */
    onDestroyIcon: function(evt) {
      evt.halt();
      this.showDestroyPrompt(evt.container);
    },

    /**
      React to the user clicking on or otherwise activating the cancel button
      on the "destroy this service" prompt.

      @method onCancelDestroy
      @param {Object} evt The event data.
      @return {undefined} Nothing.
    */
    onCancelDestroy: function(evt) {
      evt.halt();
      this.hideDestroyPrompt(evt.container);
    },

    /**
      React to the user clicking on or otherwise activating the "do it now"
      button on the "destroy this service" prompt.

      @method onInitiateDestroy
      @param {Object} evt The event data.
      @return {undefined} Nothing.
    */
    onInitiateDestroy: function(evt) {
      evt.halt();
      this.closeInspector();
      this.initiateServiceDestroy();
    },

    /**
      Handles exposing the service.

      @method toggleExpose
      @param {Y.EventFacade} e An event object.
      @return {undefined} Nothing.
    */
    toggleExpose: function(e) {
      var service = this.inspector.get('model');
      var env = this.inspector.get('db').environment;
      var exposed;
      if (service.get('exposed')) {
        this.unexposeService();
        exposed = false;
      } else {
        this.exposeService();
        exposed = true;
      }
      service.set('exposed', exposed);
    },

    /**
      Handles the click on the file input and dispatches to the proper function
      depending if a file has been previously loaded or not.

      @method handleFileClick
      @param {Y.EventFacade} e An event object.
    */
    handleFileClick: function(e) {
      if (e.currentTarget.getHTML().indexOf('Remove') < 0) {
        // Because we can't style file input buttons properly we style a normal
        // element and then simulate a click on the real hidden input when our
        // fake button is clicked.
        e.container.one('input[type=file]').getDOMNode().click();
      } else {
        this.onRemoveFile(e);
      }
    },

    /**
      Handle the file upload click event. Creates a FileReader instance to
      parse the file data.


      @method onFileChange
      @param {Y.EventFacade} e An event object.
    */
    handleFileChange: function(e) {
      var file = e.currentTarget.get('files').shift(),
          reader = new FileReader();
      reader.onerror = Y.bind(this.onFileError, this);
      reader.onload = Y.bind(this.onFileLoaded, this);
      reader.readAsText(file);
      e.container.one('.fakebutton').setHTML(file.name + ' - Remove file');
    },

    /**
      Callback called when an error occurs during file upload.
      Hide the charm configuration section.

      @method onFileError
      @param {Object} e An event object (with a "target.error" attr).
    */
    onFileError: function(e) {
      var error = e.target.error, msg;
      switch (error.code) {
        case error.NOT_FOUND_ERR:
          msg = 'File not found';
          break;
        case error.NOT_READABLE_ERR:
          msg = 'File is not readable';
          break;
        case error.ABORT_ERR:
          break; // noop
        default:
          msg = 'An error occurred reading this file.';
      }
      if (msg) {
        var db = this.inspector.get('db');
        db.notifications.add(
            new models.Notification({
              title: 'Error reading configuration file',
              message: msg,
              level: 'error'
            }));
      }
    },

    /**
      Callback called when a file is correctly uploaded.
      Hide the charm configuration section.

      @method onFileLoaded
      @param {Object} e An event object.
    */
    onFileLoaded: function(e) {
      //set the fileContent on the view-container so we can have access to it
      // when the user submit their config.
      this.inspector.fileContent = e.target.result;
      if (!this.inspector.fileContent) {
        // Some file read errors do not go through the error handler as
        // expected but instead return an empty string.  Warn the user if
        // this happens.
        var db = this.inspector.get('db');
        db.notifications.add(
            new models.Notification({
              title: 'Configuration file error',
              message: 'The configuration file loaded is empty.  ' +
                  'Do you have read access?',
              level: 'error'
            }));
      }
      var container = this.inspector.get('container');
      container.all('.settings-wrapper').hide();
      container.one('.toggle-settings-help').hide();
    },

    /**
      Handle the file remove click event by clearing out the input
      and resetting the UI.

      @method onRemoveFile
      @param {Y.EventFacade} e an event object from click.
    */
    onRemoveFile: function(e) {
      var container = this.inspector.get('container');
      this.inspector.fileContent = null;
      container.one('.fakebutton').setHTML('Import config file...');
      container.all('.settings-wrapper').show();
      // Replace the file input node.  There does not appear to be any way
      // to reset the element, so the only option is this rather crude
      // replacement.  It actually works well in practice.
      container.one('input[type=file]')
               .replace(Y.Node.create('<input type="file"/>'));
    },

    /**
      Pulls the content from each configuration field and sends the values
      to the environment

      @method saveConfig
    */
    saveConfig: function() {
      var inspector = this.inspector,
          env = inspector.get('env'),
          db = inspector.get('db'),
          service = inspector.get('model'),
          charmUrl = service.get('charm'),
          charm = db.charms.getById(charmUrl),
          schema = charm.get('options'),
          container = inspector.get('container'),
          button = container.one('button.confirm');

      button.set('disabled', 'disabled');

      var newVals = utils.getElementsValuesMapping(container, '.config-field');
      var errors = utils.validate(newVals, schema);

      if (Y.Object.isEmpty(errors)) {
        env.set_config(
            service.get('id'),
            newVals,
            null,
            Y.bind(this._setConfigCallback, this, container)
        );
      } else {
        db.notifications.add(
            new models.Notification({
              title: 'Error saving service config',
              message: 'Error saving service config',
              level: 'error'
            })
        );
        // We don't have a story for passing the full error messages
        // through so will log to the console for now.
        console.log('Error setting config', errors);
      }
    },

    /**
      Handles the success or failure of setting the new config values

      @method _setConfigCallback
      @param {Y.Node} container of the view-container.
      @param {Y.EventFacade} e yui event object.
    */
    _setConfigCallback: function(container, e) {
      container.one('.controls .confirm').removeAttribute('disabled');
      // If the user has conflicted fields and still choose to
      // save then we will be overwriting the values in Juju.
      var bindingEngine = this.inspector.bindingEngine;
      bindingEngine.clearChangedValues.call(bindingEngine, 'config');
      var db = this.inspector.get('db');
      if (e.err) {
        db.notifications.add(
            new models.Notification({
              title: 'Error setting service config',
              message: 'Service name: ' + e.service_name,
              level: 'error'
            })
        );
      } else {
        // XXX show saved notification
        // we have no story for this yet
        db.notifications.add(
            new models.Notification({
              title: 'Config saved successfully ',
              message: e.service_name + ' config set successfully.',
              level: 'info'
            })
        );
      }
    },

    /**
      Handle saving the service constraints.
      Make the corresponding environment call, passing _saveConstraintsCallback
      as callback (see below).

      @method saveConstraints
      @param {Y.EventFacade} ev An event object.
      @return {undefined} Nothing.
    */
    saveConstraints: function(ev) {
      var inspector = this.inspector;
      var container = inspector.get('container');
      var env = inspector.get('env');
      var service = inspector.get('model');
      // Retrieve constraint values.
      var constraints = utils.getElementsValuesMapping(
          container, '.constraint-field');
      // Disable the "Save" button while the RPC call is outstanding.
      container.one('.save-constraints').set('disabled', 'disabled');
      // Set up the set_constraints callback and execute the API call.
      var callback = Y.bind(this._saveConstraintsCallback, this, container);
      env.set_constraints(service.get('id'), constraints, callback);
    },

    /**
      Callback for saveConstraints.
      React to responses arriving from the API server.

      @method _saveConstraintsCallback
      @private
      @param {Y.Node} container The inspector container.
      @param {Y.EventFacade} ev An event object.
      @return {undefined} Nothing.
    */
    _saveConstraintsCallback: function(container, ev) {
      var inspector = this.inspector;
      var bindingEngine = inspector.bindingEngine;
      bindingEngine.clearChangedValues('constraints');
      var db = inspector.get('db');
      var service = inspector.get('model');
      if (ev.err) {
        // Notify an error occurred while updating constraints.
        db.notifications.add(
            new models.Notification({
              title: 'Error setting service constraints',
              message: 'Service name: ' + ev.service_name,
              level: 'error',
              modelId: service
            })
        );
      } else {
        // XXX frankban: show success notification.
        // We have no story for this yet.
        db.notifications.add(
            new models.Notification({
              title: 'Constraints saved successfully',
              message: ev.service_name + ' constraints set successfully.',
              level: 'info'
            })
        );
      }
      container.one('.save-constraints').removeAttribute('disabled');
    },

    /**
      Show a unit within the left-hand panel.
      Note that, due to the revived model below, this model can potentially
      be out of date, as the POJO from the LazyModelList is the one kept up
      to date.  This is just a first-pass and will be changed later.

      @method showUnitDetails
      @param {object} ev The click event.
      @return {undefined} Nothing.
     */
    showUnitDetails: function(ev) {
      ev.halt();
      var db = this.inspector.get('db');
      var unit = db.units.getById(ev.currentTarget.getData('unit'));
      this.inspector.showViewlet('unitDetails', unit);
    },

    /**
      Toggles the close-unit class on the unit-list-wrapper which triggers
      the css close and open animations.

      @method toggleUnitHeader
      @param {Y.EventFacade} e Click event object.
    */
    toggleUnitHeader: function(e) {
      e.currentTarget.siblings('.status-unit-content')
                     .toggleClass('close-unit');
      e.currentTarget.toggleClass('closed-unit-list');
    },

    /**
      Toggles the checked status of all of the units in the unit status
      category

      @method toggleSelectAllUnits
      @param {Y.EventFacade} e Click event object.
    */
    toggleSelectAllUnits: function(e) {
      var currentTarget = e.currentTarget,
          units = currentTarget.ancestor('.status-unit-content')
                               .all('input[type=checkbox]');
      if (currentTarget.getAttribute('checked')) {
        units.removeAttribute('checked');
      } else {
        units.setAttribute('checked', 'checked');
      }
    },

    /**
     Loads the charm details view for the inspector.

     @method onShowCharmDetails
     @param {Event} ev the click event from the overview viewlet.

     */
    onShowCharmDetails: function(ev) {
      ev.halt();
      var db = this.inspector.get('db');
      var charmId = ev.currentTarget.getAttribute('data-charmid');
      var charm = db.charms.getById(charmId);
      this.inspector.showViewlet('charmDetails', charm);
    }
  };

  /**
    Service Inspector View Container Controller

    @class ServiceInspector
   */
  views.ServiceInspector = (function() {
    var juju = Y.namespace('juju');

    var unitListNameMap = {
      error: 'Error',
      pending: 'Pending',
      running: 'Running',
      'landscape-needs-reboot': 'Needs Reboot',
      'landscape-security-upgrades': 'Security Upgrade'
    };

    /**
      Generates the unit list sorted by status category and landscape
      annotation key and returns an array with the data to
      generate the unit list UI.

      @method updateUnitList
      @param {Object} values From the databinding update method.
      @return {Array} An array of objects with agent_state or landscape
        annotation id as category and an array of units
        [{ category: 'started', units: [model, model, ...]}].
    */
    function updateUnitList(values) {
      var statuses = [],
          unitByStatus = {};

      values.each(function(value) {
        var category = utils.simplifyState(value);
        if (!unitByStatus[category]) {
          unitByStatus[category] = [];
        }
        unitByStatus[category].push(value);

        // landscape annotations
        var lIds = utils.landscapeAnnotations(value);
        lIds.forEach(function(annotation) {
          if (!unitByStatus[annotation]) {
            unitByStatus[annotation] = [];
          }
          unitByStatus[annotation].push(value);
        });
      });

      Y.Object.each(unitListNameMap, function(value, key) {
        if (unitByStatus[key]) {
          statuses.push({category: key, units: unitByStatus[key]});
        }
      });

      return statuses;
    }

    /**
      Binds the statuses data set to d3

      @method generateAndBindUnitHeaders
      @param {Array} statuses A key value pair of categories to unit list.
    */
    function generateAndBindUnitHeaders(node, statuses) {
      /*jshint validthis:true */
      var self = this,
          buttonHeight;

      var categoryWrapperNodes = d3.select(node.getDOMNode())
                                   .selectAll('.unit-list-wrapper')
                                   .data(statuses, function(d) {
                                       return d.category;
                                     });

      // D3 header enter section
      var unitStatusWrapper = categoryWrapperNodes
                                  .enter()
                                  .append('div')
                                  .classed('unit-list-wrapper', true);

      var unitStatusHeader = unitStatusWrapper
                                  .append('div')
                                  .attr('class', function(d) {
                                   return 'status-unit-header ' + d.category;
                                 });

      var unitStatusContentForm = unitStatusWrapper
                                  .append('div')
                                  .attr('class', function(d) {
                                    return 'status-unit-content ' + d.category;
                                  })
                                  .append('form');

      unitStatusContentForm.append('li')
                            .append('input')
                            .attr('type', 'checkbox')
                            .classed('toggle-select-all', true);

      unitStatusContentForm.append('ul');

      unitStatusContentForm.append('div')
                           .classed('action-button-wrapper', true)
                           .html(
          function() {
                                 var tmpl = Templates['unit-action-buttons']();
                                 buttonHeight = tmpl.offsetHeight;
                                 return tmpl;
          });

      unitStatusHeader.append('span')
                      .classed('unit-qty', true);

      unitStatusHeader.append('span')
                      .classed('category-label', true);

      unitStatusHeader.append('span')
                      .classed('chevron', true);

      // D3 header update section
      categoryWrapperNodes.select('.unit-qty')
                          .text(function(d) {
                                 return d.units.length;
                               });

      // Add the category label to each heading
      categoryWrapperNodes.select('.category-label')
                          .text(function(d) {
                                 return unitListNameMap[d.category];
                               });

      var unitsList = categoryWrapperNodes.select('ul')
                                    .selectAll('li')
                                    .data(function(d) {
                                     return d.units;
                                   }, function(unit) {
                                     return unit.id;
                                   });

      // D3 content enter section
      var unitItem = unitsList.enter()
                              .append('li');

      unitItem.append('input')
           .attr({
            'type': 'checkbox',
            'name': function(unit) {
              return unit.id;
            }});

      unitItem.append('a').text(
          function(d) {
            return d.id;
          })
          .attr('data-unit', function(d) {
            return d.service + '/' + d.number;
          });

      // D3 content update section
      unitsList.sort(
          function(a, b) {
            return a.number - b.number;
          });

      categoryWrapperNodes
          .select('.status-unit-content')
          .style('max-height', function(d) {
            if (!self._unitItemHeight) {
              self._unitItemHeight =
                  d3.select(this).select('li').property('offsetHeight');
            }
            return ((self._unitItemHeight *
                    (d.units.length + 1)) + buttonHeight) + 'px';
          });


      // D3 content exit section
      unitsList.exit().remove();

      // D3 header exit section
      categoryWrapperNodes.exit().remove();
    }

    var DEFAULT_VIEWLETS = {
      overview: {
        name: 'overview',
        template: Templates.serviceOverview,
        bindings: {
          aggregated_status: {
            'update': function(node, value) {
              var bar = this._statusbar;
              if (!bar) {
                bar = this._statusbar = new views.StatusBar({
                  target: node.getDOMNode()
                }).render();
              }
              bar.update(value);
            }
          },
          icon: {
            'update': function(node, value) {
              // XXX: Icon is only present on services that pass through
              // the Ghost phase of the GUI. Once we have better integration
              // with the charm browser API services handling of icon
              // can be improved.
              var icon = node.one('img');
              if (icon === null && value) {
                node.append('<img>');
                icon = node.one('img');
              }
              if (value) {
                icon.set('src', value);
              }
            }
          },
          units: {
            depends: ['aggregated_status'],
            'update': function(node, value) {
              // called under the databinding context
              var statuses = this.viewlet.updateUnitList(value);
              this.viewlet.generateAndBindUnitHeaders(node, statuses);
            }
          }
        },
        // These methods are exposed here to allow us access for testing.
        updateUnitList: updateUnitList,
        generateAndBindUnitHeaders: generateAndBindUnitHeaders
      },
      config: {
        name: 'config',
        template: Templates['service-configuration'],
        'render': function(service, viewContainerAttrs) {
          var settings = [];
          var db = viewContainerAttrs.db;
          var charm = db.charms.getById(service.get('charm'));
          var charmOptions = charm.get('options');
          Y.Object.each(service.get('config'), function(value, key) {
            var setting = {
              name: key,
              value: value
            };
            if (charmOptions) {
              var option = charmOptions[key];
              if (option) {
                setting.description = option.description;
                setting.type = option.type;
              }
            }
            settings.push(setting);
          });
          this.container = Y.Node.create(this.templateWrapper);

          this.container.setHTML(
              this.template({
                service: service,
                settings: settings,
                exposed: service.get('exposed')}));
          this.container.all('textarea.config-field')
                        .plug(plugins.ResizingTextarea,
                              { max_height: 200,
                                min_height: 18,
                                single_line: 18});
        },
        bindings: {
          exposed: {
            'update': function(node, value) {
              var img = node.one('img');
              var span = node.one('span');
              if (value) {
                img.set('src', '/juju-ui/assets/images/slider_on.png');
                span.set('text', 'Yes');
                span.removeClass('off');
                span.addClass('on');
              } else {
                img.set('src', '/juju-ui/assets/images/slider_off.png');
                span.set('text', 'No');
                span.removeClass('on');
                span.addClass('off');
              }
            }
          }
        },
        'conflict': function(node, model, viewletName, resolve) {
          /**
            Calls the databinding resolve method
            @method sendResolve
          */
          function sendResolve(e) {
            handler.detach();
            if (e.currentTarget.hasClass('conflicted-confirm')) {
              node.setStyle('borderColor', 'black');
              resolve(node, viewletName, newVal);
            }
            // if they don't accept the new value then do nothing.
            message.setStyle('display', 'none');
          }

          node.setStyle('borderColor', 'red');

          var message = node.ancestor('.settings-wrapper').one('.conflicted'),
              newVal = model.get(node.getData('bind'));

          message.one('.newval').setHTML(newVal);
          message.setStyle('display', 'block');

          var handler = message.delegate('click', sendResolve, 'button', this);
        },
        'unsyncedFields': function(dirtyFields) {
          this.container.one('.controls .confirm').setHTML('Overwrite');
        },
        'syncedFields': function() {
          this.container.one('.controls .confirm').setHTML('Confirm');
        }
      },
      // Service constraints viewlet.
      constraints: {
        name: 'constraints',
        template: Templates['service-constraints-viewlet'],
        readOnlyConstraints: ['provider-type', 'ubuntu-series'],
        constraintDescriptions: {
          arch: {title: 'Architecture'},
          cpu: {title: 'CPU', unit: 'Ghz'},
          'cpu-cores': {title: 'CPU Cores'},
          'cpu-power': {title: 'CPU Power', unit: 'Ghz'},
          mem: {title: 'Memory', unit: 'GB'}
        },

        bindings: {
          'constraints': {
            'format': function(value) {
              // Display undefined constraints as empty strings.
              return value || '';
            }
          }
        },

        'render': function(service, options) {
          var constraints = utils.getConstraints(
              service.get('constraints') || {},
              options.env.genericConstraints,
              this.readOnlyConstraints,
              this.constraintDescriptions);
          var contents = this.template({
            service: service,
            constraints: constraints
          });
          this.container = Y.Node.create(this.templateWrapper);
          this.container.setHTML(contents);
        },

        'conflict': function(node, model, viewletName, resolve) {
          /**
            Calls the databinding resolve method.
            @method sendResolve
          */
          function sendResolve(ev) {
            handler.detach();
            if (ev.currentTarget.hasClass('conflicted-confirm')) {
              resolve(node, viewletName, newValue);
            }
            // If the user does not accept the new value then do nothing.
            message.hide();
          }
          var newValue = model.get(node.getData('bind'));
          if (newValue !== node.get('value')) {
            // If the value changed, give the user the possibility to
            // select which value to preserve.
            var message = node.ancestor('.control-group').one('.conflicted');
            message.one('.newval').setHTML(newValue);
            message.show();
            var handler = message.delegate(
                'click', sendResolve, 'button', this);
          } else {
            // Otherwise, just resolve this conflict.
            resolve(node, viewletName, newValue);
          }
        }
      },
      //relations: {},
      ghostConfig: {
        name: 'ghostConfig',
        template: Templates['ghost-config-viewlet'],
        'render': function(model) {
          this.container = Y.Node.create(this.templateWrapper);

          var options = model.getAttrs();
          // XXX - Jeff
          // not sure this should be done like this
          // but this will allow us to use the old template.

          options.settings = utils.extractServiceSettings(options.options);

          this.container.setHTML(this.template(options));
        }
      }
    };

    // Add any imported viewlets into this DEFAULT_VIEWLETS from doom.
    DEFAULT_VIEWLETS = Y.merge(DEFAULT_VIEWLETS, viewletNS);

    // This variable is assigned an aggregate collection of methods and
    // properties provided by various controller objects in the
    // ServiceInspector constructor.
    var controllerPrototype = {};
    /**
      Constructor for View Container Controller

      @method ServiceInspector
      @constructor
    */
    function ServiceInspector(model, options) {
      this.model = model;
      this.options = options;
      options = options || {};
      options.viewlets = {};
      options.templateConfig = options.templateConfig || {};

      var container = Y.Node.create('<div>')
          .addClass('panel')
          .addClass('yui3-juju-inspector')
          .appendTo(Y.one('#content'));

      var self = this;
      options.container = container;
      options.viewletContainer = '.viewlet-container';

      // Build a collection of viewlets from the list of required viewlets.
      var viewlets = {};
      options.viewletList.forEach(function(viewlet) {
        viewlets[viewlet] = DEFAULT_VIEWLETS[viewlet];
      });
      // Mix in any custom viewlet configuration options provided by the config.
      options.viewlets = Y.mix(
          viewlets, options.viewlets, true, undefined, 0, true);

      options.model = model;

      // Merge the various prototype objects together.  Additionally, merge in
      // mixins that provide functionality used in the inspector's events.
      var c = Y.juju.controller;
      [c.ghostInspector,
        c.serviceInspector,
        ns.manageUnitsMixin,
        ns.exposeButtonMixin]
        .forEach(function(controller) {
            controllerPrototype = Y.mix(controllerPrototype, controller);
          });

      // Bind the viewletEvents to this class.
      Y.Object.each(options.viewletEvents, function(
          handlers, selector, collection) {
            // You can have multiple listeners per selector.
            Y.Object.each(handlers, function(callback, event, obj) {
              options.viewletEvents[selector][event] = Y.bind(
                  controllerPrototype[callback], self);
            });
          });

      options.events = Y.mix(options.events, options.viewletEvents);

      this.inspector = new views.ViewContainer(options);
      this.inspector.slots = {
        'left-hand-panel': '.left-breakout'
      };
      this.inspector.render();
      this.inspector.showViewlet(options.viewletList[0]);
    }

    ServiceInspector.prototype = controllerPrototype;

    return ServiceInspector;
  })();


}, '0.1.0', {
  requires: [
    'base-build',
    'd3-statusbar',
    'dd',
    'event-key',
    'event-resize',
    'handlebars',
    'json-stringify',
    'juju-databinding',
    'juju-models',
    'juju-view-container',
    'juju-view-service',
    'juju-view-utils',
    'node',
    'panel',
    'transition',
    'view',
    // Imported viewlets
    'viewlet-charm-details',
    'viewlet-unit-details'
  ]
});
