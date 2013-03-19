=========================
Juju GUI CI Documentation
=========================
The Juju GUI CI runs our unit and Selenium tests across multiple browsers using
`Sauce Labs`__. It will check the gui repository for changes every hour and if
there has been a change it will run our tets across Win 8 IE10, Linux Chrome
(latest), and Linux FireFox (latest).

__ https://saucelabs.com/

Our CI setup is run on the Canonical `QA labs Jenkins server`__ beind the QA
VPN. In order to access the Jenkins server you will need `VPN access`__, need to
create an account in Jenkins, and have that account approved by the
administrator.

__ http://10.189.74.2:8080/job/jujugui-test-charm/
__ https://wiki.canonical.com/UbuntuEngineering/QA/VPN

The credentials for the various systems that we rely on can be found at
`JujuGUICI on the wiki`__.

__ https://wiki.canonical.com/JujuGUICI

How it works
------------
When Jenkins detects a change it first attempts to destroy any lagging
canonistack instances to avoid stale code hanging around which could cause
instability in the tests. It then does a lightweight checkout of the lp:juju-gui
repository and runs bin/test-charm.

bin/test-charm runs lib/deploy_charm_for_testing.py and, if the deployment is
successful, executes test/test_charm_running.py for each of the specified
browsers; finishing it up by destroying the juju test environment.

Charm testing configuration and setup
-------------------------------------
The testing script relies on a few environment variables and flags for
configuration::

  bin/test-charm
  JUJU_GUI_TEST_BROWSERS: "chrome firefox ie" {String} The browsers to run the
  test suite on.
  FAIL_FAST: 0 {Integer} Set to 1 to exit when first browser returns a failure
  rather than completing all of the tests.

  lib/deploy_charm_for_testing.py
  --origin: "lp:juju-gui" {String} Location of the GUI code
  --charm: "cs:~juju-gui/precise/juju-gui" {String} Location of the charm code
  JUJU_INSTANCE_IP: {String} Public IP address to assign to GUI test instance
  used only for Canonistack deployments.

The Juju GUI charm has a few important configuration properties to enable its
testing setup::

  serve-tests: False {Boolean} Exposes the tests for browser access at host/test
  staging: False {Boolean} Connects the GUI to the staging backend
  secure: True {Boolean} Allows the GUI to operate over a non-https connection
  juju-gui-source: "lp:juju-gui" {String} Where to pull the GUI from

A complete listing of its configuration properties can be found in the
config.yaml file in the charm's root directory.

Running the tests on Canonistack
--------------------------------
The Jenkins slave which runs our CI has a Juju environments.yaml file with
juju-testing-gui defined::

  /home/jujugui-merger/.juju/environments.yaml

After bootstrapping the juju environment it deploys the Juju GUI charm with the
following configuration properties::

  { 'serve-tests': True,
    'staging': True,
    'secure': False,
    'juju-gui-source': args.branch } // uses default - only change for devel

After the instances have started, but before the charm has been installed, it
assigns an external IP address to our charm instance. External IP's are
hard to come by on Canonistack and as such we need to be sure this one is used
at least once every 7 days to avoid it being released from our user.

Once the charm comes online the instance is then exposed and the tests are run.

How do I run the tests on EC2?
------------------------------
If you want to run the unit and Selenium tests on EC2 you simply need to
configure your juju environments file by following the `getting started`__
guide for EC2.

__ https://juju.ubuntu.com/docs/getting-started.html

Rename your newly configured EC2 juju config to be `juju-gui-testing` and run::

  bin/test-charm

How do I view and edit the Jenkins results and configuration?
------------------------------------------------------------
You will need to log into the `QA labs Jenkins server`__ which requires
`VPN access`__ and a Jenkins account.

__ http://10.189.74.2:8080/job/jujugui-test-charm/
__ https://wiki.canonical.com/UbuntuEngineering/QA/VPN

How do I debug test failures?
-----------------------------
While the tests are running and after they are complete the Jenkins control
panel will show you the console output of the results. If there are failures in
this list you will need to use the debug information that was output to track
down the failure. Look in particular for the links to the videos.

If the failure is with a unit test it will be much faster to run those locally
in the failing browser to determine the issue. Make sure that locally you start
with a clean checkout of the code that the CI will be running::

  bzr branch lp:juju-gui
  make clean-all
  make build-prod
  sh test-server.sh prod true

If the issue only appears during testing you will find spinning up EC2 instances
to be much faster for debugging.

What files are involved in the Selenium and unit tests?
-------------------------------------------------------
There are quite a number of files which are involved in the CI process::

  Makefile
  test-server.js
  bin/test-charm
  lib/deploy_charm_for_testing.py
  test/browser.py
  test/test_charm_running.py