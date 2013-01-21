'use strict';

describe('service module annotations', function() {
  var db, juju, models, viewContainer, views, Y, serviceModule;
  var called, location;
  before(function(done) {
    Y = YUI(GlobalConfig).use(['node',
      'juju-models',
      'juju-views',
      'juju-gui',
      'juju-env',
      'juju-tests-utils',
      'node-event-simulate'],
    function(Y) {
      juju = Y.namespace('juju');
      models = Y.namespace('juju.models');
      views = Y.namespace('juju.views');
      done();
    });
  });

  beforeEach(function() {
    viewContainer = Y.Node.create('<div />');
    viewContainer.appendTo(Y.one('body'));
    viewContainer.hide();
    db = new models.Database();
    called = false;
    location =
        { 'gui.x': 0,
          'gui.y': 0};
    var env = {
      update_annotations: function(name, data) {
        called = true;
        location['gui.x'] = data['gui.x'];
        location['gui.y'] = data['gui.y'];},
      get: function() {}};
    var view = new views.environment(
        { container: viewContainer,
          db: db,
          env: env});
    view.render();
    view.rendered();
    serviceModule = view.topo.modules.ServiceModule;
  });

  afterEach(function() {
    if (viewContainer) {
      viewContainer.remove(true);
    }
  });

  // Test the drag end handler.
  it('should set location annotations on service block drag end',
     function() {
       var d =
           { id: 'wordpress',
             x: 100.1,
             y: 200.2};
       serviceModule._dragend(d, 0);
       assert.isTrue(called);
       location['gui.x'].should.equal(100.1);
       location['gui.y'].should.equal(200.2);
     });

  it('should not set annotations on drag end if building a relation',
     function() {
       var d =
           { id: 'wordpress',
             x: 100.1,
             y: 200.2};
       var topo = serviceModule.get('component');
       topo.buildingRelation = true;
       serviceModule._dragend(d, 0);
       assert.isFalse(called);
       location['gui.x'].should.equal(0);
       location['gui.y'].should.equal(0);
     });

  it('should ', function() {});

  it('should ', function() {});
  it('should ', function() {});
});


describe('service module events', function() {
  var db, juju, models, serviceModule, view, viewContainer, views, Y;
  before(function(done) {
    Y = YUI(GlobalConfig).use(['node',
      'juju-models',
      'juju-views',
      'juju-gui',
      'juju-env',
      'juju-tests-utils',
      'node-event-simulate'],
    function(Y) {
      juju = Y.namespace('juju');
      models = Y.namespace('juju.models');
      views = Y.namespace('juju.views');
      done();
    });
  });

  beforeEach(function() {
    viewContainer = Y.Node.create('<div />');
    viewContainer.appendTo(Y.one('body'));
    db = new models.Database();
    db.services.add({id: 'haproxy'});
    view = new views.environment({
      container: viewContainer,
      db: db,
      env: {}
    });
    view.render();
    view.rendered();
    serviceModule = view.topo.modules.ServiceModule;
  });

  afterEach(function() {
    if (viewContainer) {
      viewContainer.remove(true);
    }
  });

  it('should toggle the service menu',
     function() {
       var box = serviceModule.service_boxes.haproxy;
       var menu = viewContainer.one('#service-menu');
       assert.isFalse(menu.hasClass('active'));
       serviceModule.service_click_actions.toggleServiceMenu(
           box, serviceModule, serviceModule);
       assert(menu.hasClass('active'));
       serviceModule.service_click_actions.toggleServiceMenu(
           box, serviceModule, serviceModule);
       assert.isFalse(menu.hasClass('active'));
     });

  it('should show the service menu',
     function() {
       var box = serviceModule.service_boxes.haproxy;
       var menu = viewContainer.one('#service-menu');
       assert.isFalse(menu.hasClass('active'));
       serviceModule.service_click_actions.showServiceMenu(
           box, serviceModule, serviceModule);
       assert(menu.hasClass('active'));
       // Check no-op.
       serviceModule.service_click_actions.showServiceMenu(
           box, serviceModule, serviceModule);
       assert(menu.hasClass('active'));
     });

  it('should hide the service menu',
     function() {
       var box = serviceModule.service_boxes.haproxy;
       var menu = viewContainer.one('#service-menu');
       serviceModule.service_click_actions.showServiceMenu(
           box, serviceModule, serviceModule);
       assert(menu.hasClass('active'));
       serviceModule.service_click_actions.hideServiceMenu(
           null, serviceModule);
       assert.isFalse(menu.hasClass('active'));
       // Check no-op.
       serviceModule.service_click_actions.hideServiceMenu(
           null, serviceModule);
       assert.isFalse(menu.hasClass('active'));
     });

  it('should not show the service menu after the service is double-clicked',
     function() {
       // Monkeypatch to avoid the click event handler bailing out early.
       serviceModule.service_boxes.haproxy.containsPoint = function() {
         return true;};
       var service = viewContainer.one('.service');
       var menu = viewContainer.one('#service-menu');
       service.simulate('click');
       // Ideally the browser would not send the click event right away...
       assert(menu.hasClass('active'));
       service.simulate('dblclick');
       assert.isFalse(menu.hasClass('active'));
     });

  it('should ignore clicks outside the service node',
     function(){
       // Monkeypatch to test the click event handler bailing out early.
       serviceModule.service_boxes.haproxy.containsPoint = function() {
         return false;};
       var service = viewContainer.one('.service');
       var menu = viewContainer.one('#service-menu');
       assert.isFalse(menu.hasClass('active'));
       service.simulate('click');
       assert.isFalse(menu.hasClass('active'));
     });
});

describe('service menu', function() {
  var Y, views;

  before(function(done) {
    Y = YUI(GlobalConfig).use(['juju-topology'], function(Y) {
      views = Y.namespace('juju.views');
      done();
    });
  });

  it('should disable the "Destroy" menu for the Juju GUI service', function() {
    var service = {
      charm: 'cs:precise/juju-gui-7'
    };
    var addedClassName;
    var menu = {
      hasClass: function() {
        return false;
      },
      addClass: function() {},
      one: function() {
        return {
          addClass: function(className) {
            addedClassName = className;
          }
        };
      }
    };
    var fauxView = {
      get: function(name) {
        if (name === 'container') {
          return {one: function() { return menu; }};
        } else if (name === 'component') {
          return { set: function() {},
                   serviceForBox: function(box) { return service;}
                 };
        }
      },
      updateServiceMenuLocation: function() {}
    };
    var view = new views.ServiceModule();
    view.service_click_actions.toggleServiceMenu(
        service, fauxView, undefined);
    assert.equal(addedClassName, 'disabled');
  });

  it('should toggle the service menu',
     function() {
       var box = serviceModule.service_boxes.haproxy;
       var menu = viewContainer.one('#service-menu');
       assert.isFalse(menu.hasClass('active'));
       serviceModule.service_click_actions.toggleServiceMenu(
           box, serviceModule, serviceModule);
       assert(menu.hasClass('active'));
       serviceModule.service_click_actions.toggleServiceMenu(
           box, serviceModule, serviceModule);
       assert.isFalse(menu.hasClass('active'));
     });

});
