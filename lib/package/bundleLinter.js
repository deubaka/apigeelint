//bundleLinter.js
var fs = require("fs"),
  path = require("path"),
  Bundle = require("./Bundle.js"),
  request = require("request"),
  debug = require("debug")("bundlelinter:");

function contains(a, obj, f) {
  if (!a || !a.length) {
    return false;
  }
  f =
    f ||
    function(lh, rh) {
      return lh === rh;
    };

  for (var i = 0; i < a.length; i++) {
    if (f(a[i], obj)) {
      if (!a[i]) {
        return true;
      }
      return a[i];
    }
  }
  return false;
}

function exportData(path, report) {
  fs.writeFile(
    path + "apigeeLint.json",
    JSON.stringify(report, null, 4),
    "utf8",
    function(err) {
      if (err) {
        return console.log(err);
      }
    }
  );
}

var lint = function(config, done) {
  var bundle = new Bundle(config);
  //for each plugin
  var normalizedPath = path.join(__dirname, "plugins");
  fs.readdirSync(normalizedPath).forEach(function(file) {
    if (!config.plugins || contains(config.plugins, file)) {
      try {
        executePlugin(file, bundle);
      } catch (e) {
        debug("plugin error: " + file + e);
      }
    }
  });

  var fmt = config.formatter || "json.js",
    fmtImpl = this.getFormatter(fmt),
    fmtReport = fmtImpl(bundle.getReport());

  if (config.output) {
    if (typeof config.output == "function") {
      config.output(fmtReport);
    }
  } else {
    console.log(fmtReport);
  }

  if (fmt !== "json.js") {
    (fmt = "json.js"), (fmtImpl = this.getFormatter(
      fmt
    )), (fmtReport = JSON.parse(fmtImpl(bundle.getReport())));
  } else {
    fmtReport = JSON.parse(fmtReport);
  }
  if (config.apiUpload) {
    var policySLOC = 0,
      resourceSLOC = 0;
    bundle.getResources().forEach(function(resource) {
      resourceSLOC += resource.getLines().length;
    });
    bundle.getPolicies().forEach(function(policy) {
      policySLOC += policy.getLines().length;
    });

    var htmlReport = this.getFormatter("html.js")(bundle.getReport());

    var myReq = {
      uri:
        config.apiUpload.destPath ||
        "https://csdata-test.apigee.net/v1/lintresults",
      headers: { "Content-Type": "application/json" },
      json: true,
      method: "POST",
      body: {
        authorization: config.apiUpload.authorization,
        organization: config.apiUpload.organization,
        name: bundle.getName(),
        revision: bundle.getRevision(),
        policyCount: bundle.getPolicies().length,
        resourceCount: bundle.getResources().length,
        policySLOC,
        resourceSLOC,
        lintingResults: fmtReport,
        htmlReport
      }
    };

    var cb = function(err, httpResponse, body) {
      if (err) {
        throw new Error("upload failed:", err);
      }
      console.log("Upload successful!  Server responded with:", body);
    };

    request.post(myReq, cb);
  }

  if (config.writePath) {
    exportData(config.writePath, fmtReport);
  }
  if(done){
    done();
  }
};

var getFormatter = function(format) {
  // default is stylish
  var formatterPath;

  format = format || "stylish.js";
  if (typeof format === "string") {
    format = format.replace(/\\/g, "/");
    // if there's a slash, then it's a file
    if (format.indexOf("/") > -1) {
      const cwd = this.options ? this.options.cwd : process.cwd();
      formatterPath = path.resolve(cwd, format);
    } else {
      formatterPath = `./formatters/${format}`;
    }

    try {
      return require(formatterPath);
    } catch (ex) {
      ex.message = `There was a problem loading formatter: ${formatterPath}\nError: ${ex.message}`;
      throw ex;
    }
  } else {
    return null;
  }
};

var executePlugin = function(file, bundle, cb) {
  if (file.endsWith(".js")) {
    //lets see if this really is a plugin
    var plugin = require("./plugins/" + file);
    if (plugin.plugin.enabled) {
      bundle.onBundle(plugin.onBundle);
      bundle.onSteps(plugin.onStep);
      bundle.onConditions(plugin.onCondition);
      bundle.onProxyEndpoints(plugin.onProxyEndpoint);
      bundle.onTargetEndpoints(plugin.onTargetEndpoint);
      bundle.onResources(plugin.onResource);
      bundle.onPolicies(plugin.onPolicy);
      bundle.onFaultRules(plugin.onFaultRule);
      bundle.onDefaultFaultRules(plugin.onDefaultFaultRule);
    }
  }
  if (cb) {
    cb(bundle);
  }
};

module.exports = {
  lint,
  executePlugin,
  getFormatter
};