#!/usr/bin/env node

'use strict';

// Intrinsic modules.
var util = require('util');
var path = require('path');

// Npm modulez
var _ = require('lodash');
var Promise = require('bluebird');
Promise.longStackTraces();

// "Constants"
var PLUGIN_NAME = 'kalabox-plugin-pantheon';

// Terminus node client
// for some things it is better to use the node client because we dont have
// to worry about an error we need to handle killing the whole damn thing
var Client = require('./client.js');
var pantheon = new Client();

/*
 * Constructor.
 */
function Terminus(kbox, app) {

  // Kbox things
  this.app = app;
  this.kbox = kbox;

  // @todo: more caching?
  this.uuid = undefined;
}

/*
 * WE DEFINITELY NEED TO EITHER RETRIEVE AND VALIDATE A SESSION BEFORE WE
 * ACTALLY DO STUFF OR LOGIN
 *
 * @todo @todo @todo @todo @todo @todo @todo @todo @todo @todo @todo @todo
 */

/*
 * Return the metric record's ID, or create one if it doesn't have one.
 */
Terminus.prototype.__buildQuery = function(cmd, args, options) {

  return cmd.concat(args).concat(options);

};

/*
 * Send and handle a REST request.
 */
Terminus.prototype.__request = function(cmd, args, options) {

  // Save for later.
  var self = this;

  var globalConfig = this.kbox.core.deps.get('globalConfig');

  // Build create options.
  var idObj = this.kbox.util.docker.containerName.createTemp();
  var id = this.kbox.util.docker.containerName.format(idObj);
  var createOpts = this.kbox.util.docker.CreateOpts(id)
    .workingDir('/' + globalConfig.codeDir)
    .volumeFrom(this.app.dataContainerName)
    .json();
  /* jshint ignore:start */
  //jscs:disable
  createOpts.Entrypoint = ["/bin/sh", "-c"];
  /* jshint ignore:end */

  // Get provider.
  return this.kbox.engine.provider()
  .then(function(provider) {

    // Build start options
    var homeBind = self.app.config.homeBind;
    var startOpts = self.kbox.util.docker.StartOpts()
      .bind(path.join(homeBind, '.terminus'), '/root/.terminus')
      .bind(homeBind, '/ssh')
      .bind(self.app.rootBind, '/src')
      .json();

    var query = self.__buildQuery(cmd, args, options);
    return self.kbox.engine.use('terminus', createOpts, startOpts, function(container) {
      return self.kbox.engine.queryData(container.id, query);
    });
  });
};

/*
 * TERMINUS COMMANDS
 */

/**
 * Gets plugin conf from the appconfig or from CLI arg
 **/
Terminus.prototype.getOpts = function(options) {
  // Grab our options from config
  var defaults = this.app.config.pluginConf[PLUGIN_NAME];
  // Override any config coming in on the CLI
  _.each(Object.keys(defaults), function(key) {
    if (_.has(options, key) && options[key]) {
      defaults[key] = options[key];
    }
  });
  return defaults;
};


/*
 * Run an interactive terminus command
 */
Terminus.prototype.cmd = function(cmd, opts, done) {

  var engine = this.kbox.engine;
  var Promise = this.kbox.Promise;
  var globalConfig = this.kbox.core.deps.lookup('globalConfig');

  // Run the terminus command in the correct directory in the container if the
  // user is somewhere inside the code directory on the host side.
  // @todo: consider if this is better in the actual engine.run command
  // vs here.

  // Get current working directory.
  var cwd = process.cwd();

  // Get code root.
  var codeRoot = this.app.config.codeRoot;

  // Get the branch of current working directory.
  // Run the terminus command in the correct directory in the container if the
  // user is somewhere inside the code directory on the host side.
  // @todo: consider if this is better in the actual engine.run command
  // vs here.
  var workingDirExtra = '';
  if (_.startsWith(cwd, codeRoot)) {
    workingDirExtra = cwd.replace(codeRoot, '');
  }
  var codeDir = globalConfig.codeDir;
  var workingDir = '/' + codeDir + workingDirExtra;

  // Image name.
  var image = 'terminus';

  // Build create options.
  var createOpts = this.kbox.util.docker.CreateOpts()
    .workingDir(workingDir)
    .volumeFrom(this.app.dataContainerName)
    .json();

  // Build start options.
  var startOpts = this.kbox.util.docker.StartOpts()
    .bind(this.app.config.homeBind, '/ssh')
    .bind(path.join(this.app.config.homeBind, '.terminus'), '/root/.terminus')
    .bind(this.app.rootBind, '/src')
    .json();

  // Perform a container run.
  return engine.run(image, cmd, createOpts, startOpts)
  // Return.
  .nodeify(done);

};

/*
 * Get connection mode
 * terminus site connection-mode --site="$PANTHEON_SITE" --env="$PANTHEON_ENV")
 */
Terminus.prototype.getConnectionMode = function(site, env) {

  // @todo: can we use something like optimist to do better
  // options parsing?
  return this.__request(
    ['terminus'],
    ['site', 'connection-mode'],
    ['--json', '--site=' + site, '--env=' + env]
  );

};

/*
 * Set connection mode
 * terminus site connection-mode --site="$PANTHEON_SITE" --env="$PANTHEON_ENV" --set=git
 */
Terminus.prototype.setConnectionMode = function(site, env) {

  // @todo: can we use something like optimist to do better
  // options parsing?
  return this.__request(
    ['terminus'],
    ['site', 'connection-mode'],
    ['--json', '--site=' + site, '--env=' + env, '--set=git']
  );

};

/*
 * Get site uuid
 * terminus site info --site="$PANTHEON_SITE" --field=id
 */
Terminus.prototype.getUUID = function(site) {

  // We run this a lot so lets cache per run and do a lookup before we
  // make a request
  if (this.uuid !== undefined) {
    return Promise.resolve(this.uuid);
  }

  // More of this sort of thing
  var self = this;

  // Make a request
  return this.__request(
    ['terminus'],
    ['site', 'info'],
    ['--json', '--site=' + site, '--field=id']
  )
  .then(function(uuid) {
    self.uuid = uuid.trim();
    return Promise.resolve(self.uuid);
  });

};

/*
 * Get site aliases
 * terminus sites aliases
 */
Terminus.prototype.getSiteAliases = function() {

  // @todo: can we use something like optimist to do better
  // options parsing?
  return this.__request(['terminus'], ['sites', 'aliases'], ['--json']);

};

/*
 * Get latest DB backup and save it in /other
 * terminus site backup get --element=database --site=<site>
 * --env=<env> --to-directory=$HOME/Desktop/ --latest
 */
Terminus.prototype.downloadDBBackup = function(site, env) {

  // @todo: can we use something like optimist to do better
  // options parsing?
  // @todo: we need to generate a random
  return this.__request(
    ['terminus'],
    ['site', 'backup', 'get'],
    [
      '--json',
      '--element=database',
      '--site=' + site,
      '--env=' + env,
      '--to-directory=/src/config/terminus',
      '--latest',
      '--nocache'
    ]);
};

/*
 * Get latest DB backup and save it in /other
 * terminus site backup create --element=database --site=<site>
 * --env=<env>
 */
Terminus.prototype.createDBBackup = function(site, env) {

  // @todo: can we use something like optimist to do better
  // options parsing?
  return this.__request(
    ['terminus'],
    ['site', 'backup', 'create'],
    [
      '--json',
      '--element=database',
      '--site=' + site,
      '--env=' + env
    ]);
};

/*
 * Get json of all DB backups
 * terminus site backup list --site=<site>
 * --env=<env>
 */
Terminus.prototype.hasDBBackup = function(uuid, env) {

  return pantheon.getBackups(uuid, env)
    .then(function(backups) {
      var keyString = _.keys(backups).join('');
      console.log(keyString);
      return Promise.resolve(_.includes(keyString, 'backup_database'));
    });
};

/*
 * Get json of all DB backups
 * terminus site backup list --site=<site>
 * --env=<env>
 */
Terminus.prototype.getBindings = function(uuid) {

  return pantheon.getBindings(uuid);
};


// Return constructor as the module object.
module.exports = Terminus;
