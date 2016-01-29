'use strict';

module.exports = function(kbox) {

  kbox.whenAppRegistered(function(app) {

    // Get our push and pull stuff
    var puller = require('./pull.js')(kbox, app);
    var pusher = require('./push.js')(kbox, app);

    // Grab the needed clients
    var Terminus = require('./terminus.js');
    var terminus = new Terminus(kbox, app);

    // Set the integrations pull method.
    kbox.integrations.get('pantheon').setMethod('pull', function(opts) {
      var self = this;
      // Default option handling.
      opts = opts || {};
      opts.files = opts.files || true;
      opts.database = opts.database || true;
			// Pull.
      return kbox.Promise.try(function() {
        // Grab pantheon config so we can mix in interactives
        var config = app.config.pluginconfig.pantheon;
        // Grab pantheon aliases
        return terminus.getSiteAliases()
        // Pull our code
        .then(function() {
          self.update('Pulling code.');
          return puller.pullCode(config.site, config.env);
        })
        // Pull our DB if selected
        .then(function() {
          if (opts.database) {
            self.update('Pulling database.');
            return puller.pullDB(config.site, config.env);
          }
        })
        // Pull our files if selected
        .then(function() {
          if (opts.files) {
            self.update('Pulling files.');
            return puller.pullFiles(config.site, config.env);
          }
        })
        .then(function() {
          self.update('Done pulling.');
        });
      });
    });

    // Set the integrations push method.
    kbox.integrations.get('pantheon').setMethod('push', function(opts) {
      // Save reference for later.
      var self = this;
			// Default options.
      opts = opts || {};
      opts.message = opts.message || 'No commit message given.';
      opts.database = opts.database || false;
      opts.files = opts.files || false;
      // Get plugin.
      var config = app.config.pluginconfig.pantheon;
      // Get site aliases.
      return kbox.Promise.try(function() {
        return terminus.getSiteAliases();
      })
      // Push code.
      .tap(function() {
        self.update('Pushing code.');
        return pusher.pushCode(
          config.site,
          config.env,
          opts.message
        );
      })
      // Push database.
      .tap(function() {
        if (opts.database) {
          self.update('Pushing database.');
          return pusher.pushDB(config.site, config.env);
        }
      })
      // Push files.
      .tap(function() {
        if (opts.files) {
          self.update('Pushing files.');
          return pusher.pushFiles(config.site, config.env);
        }
      })
      // Signal completion.
      .tap(function() {
        self.update('Done pushing.');
      });
    });

  });

};
