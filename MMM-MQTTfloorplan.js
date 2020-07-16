Module.register('MMM-MQTTfloorplan', {
  defaults: {
    mqttServer: {
      url: 'mqtt-broker', // must not have trailing slash! Replace with your MQTT broker IP address
      user: '',
      password: '',
    },

    floorplan: {
      /* store your image as 'floorplan.png' to avoid git repository changes. */
      // image: "floorplan-default.png", // located in subfolder 'images'
      image: 'ground-floorplan.png', // located in subfolder 'images'
      width: 320, // image width
      height: 466, // image height
    },
    light: {
      // Default display settings for objects of this type
      image: 'light.png', // located in subfolder 'images'
      width: 19, // image width
      height: 19, // image height
      defaultStatus: 'none', // Display by default, if we don't know the status yet ? block/none
    },
    gates: {
      // Default display settings for objects of this type
      // Allow for two different sizes of gate icons
      imageOpen: 'open-gates-med.png', // located in subfolder 'images'
      imageClosed: 'closed-gates-med.png', // located in subfolder 'images'
      imageOpenTiny: 'open-gates-tiny.png', // located in subfolder 'images'
      imageClosedTiny: 'closed-gates-tiny.png', // located in subfolder 'images'
      width: 64, // image width
      height: 64, // image height
      widthTiny: 32, // image width
      heightTiny: 32, // image height
    },
    door: {
      // Default display settings for objects of this type
      defaultColor: 'blue', // css format, i.e. color names or color codes
      imageClosed: 'closed-door-tiny.png', // located in subfolder 'images'
      imageOpen: 'open-door-tiny.png', // located in subfolder 'images'
      width: 22, // image width
      height: 33, // image height
    },
    motion: {
      // Default display settings for objects of this type
      image: 'motion-detected-med.png', // located in subfolder 'images'
      imageTiny: 'motion-detected-tiny-v2.png', // located in subfolder 'images'
      width: 30, // image width
      height: 52, // image height
      widthTiny: 18, // image width
      heightTiny: 32, // image height
      fadeIntervalS: 20, // How many seconds should we decay the motion icon over ? Do this in 10 steps.
    },
    label: {
      // Default display settings for objects of this type
      defaultColor: 'grey', // css format
      defaultSize: 'medium', // value of font-size style, e.g. xx-small, x-small, small, medium, large, x-large, xx-large, 1.2em, 20px
    },

    subscriptions: [
      // Some examples of allowable entries in the Config file:
      // {
      // 	topic: 'devices/ground/kitchen/door/status',
      // 	label: 'Kitchen Outside Door',
      // 	type: 'door',
      // 	display: { left: 220, top: 350 },
      // },
      // {
      // 	topic: 'devices/ground/lounge/pir/status',
      // 	label: 'Lounge Presence',
      // 	type: 'motion',
      // 	display: { left: 150, top: 60 },
      // },
      // {
      // 	topic: 'devices/gate/status',
      // 	label: 'Driveway Gate',
      // 	type: 'gates',
      // 	display: { left: 255, top: 30 , tiny: true},
      // },
    ],

    timerVars: {}, // Used to store the setInterval handles of decay timers for motion detectors
  },

  getScripts: function () {
    return [this.file('node_modules/jsonpointer/jsonpointer.js')];
  },

  getStyles: function () {
    return ['MMM-MQTTfloorplan.css'];
  },

  start: function () {
    console.log('Starting module: ' + this.name + ' with ' + this.config.subscriptions.length + ' topics');

    this.sendSocketNotification('MQTT_CONFIG', this.config);
  },

  getDom: function () {
    var floorplan = document.createElement('div');
    floorplan.style.cssText =
      'background-image:url(' +
      this.file('/images/' + this.config.floorplan.image) +
      ');' +
      'top:-' +
      this.config.floorplan.height +
      'px;width:' +
      this.config.floorplan.width +
      'px;height:' +
      this.config.floorplan.height +
      'px;';

    floorplan.classList.add('MQTT-floorplan__wrapper');
    this.appendSensors(floorplan);
    return floorplan;
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === 'MQTT_PAYLOAD') {
      if (payload != null) {
        var config = {};
        for (i = 0; i < this.config.subscriptions.length; i++) {
          if (this.config.subscriptions[i].topic == payload.topic) {
            var value = payload.value;
            this.config.subscriptions[i].lastChanged = Date.now();

            // Just grab local config ref for convenience
            config = this.config.subscriptions[i];

            // Extract value if JSON Pointer is configured
            if (config.jsonpointer) {
              value = get(JSON.parse(value), config.jsonpointer);
            }

            this.updateDivForItem(i, value.toUpperCase(), config);
          }
        }
      } else {
        console.log(this.name + ': MQTT_PAYLOAD - Payload was empty');
      }
    }
  },

  updateDivForItem: function (index, state, config) {
    // Adjust display acccording to the type of thing that we're dealing with

    var element = document.getElementById('mqtt_' + index);

    if (config.type == 'light') {
      var visible =
        state.includes('TRUE') ||
        state.includes('ON') ||
        state.includes('OPEN') ||
        (!isNaN(parseInt(state)) && parseInt(state) > 0);
      this.setVisible('mqtt_' + index, visible);
    } else if (config.type == 'motion') {
      var visible =
        state.includes('TRUE') ||
        state.includes('ON') ||
        state.includes('OPEN') ||
        (!isNaN(parseInt(state)) && parseInt(state) > 0);

      if (visible) {
        this.setVisible('mqtt_' + index, visible);
        if (this.config.timerVars[index]) {
          clearInterval(this.config.timerVars[index]); // Reset any fade timers that might be running
        }
      } else if (element.style.display != 'none') {
        // Don't just set the icon invisible for motion - start a fade-out decay
        // Multiply fade interval by 100 rather than 1000 to get 10 steps on way to total delay
        // console.log("Starting decay timer for index " + String(index) + " named " + config.label);
        this.config.timerVars[index] = setInterval(
          this.fadeMotionImage,
          this.config.motion.fadeIntervalS * 100,
          index,
          this.config.motion.fadeIntervalS,
          config
        );
      }
    } else if (config.type == 'door') {
      var closed =
        state.includes('FALSE') ||
        state.includes('OFF') ||
        state.includes('CLOSED') ||
        (!isNaN(parseInt(state)) && (parseInt(state) === 0 || parseInt(state) === 23));

      image = closed ? this.config.door.imageClosed : this.config.door.imageOpen;

      if (element != null) {
        element.innerHTML =
          "<img src='" +
          this.file('/images/' + image) +
          "' style='" +
          'height:' +
          this.config.door.height +
          'px;width:' +
          this.config.door.width +
          "px;'/>";
      }
      // This will hide the image for an open door if it's a Quadrant type
      // this.setVisible("mqtt_" + index, visible);
      // if (config.display.counterwindow !== 'undefined' && config.display.radius !== 'undefined') {
      // 	this.setVisible("mqtt_" + index + "_counterwindow", visible);
      // }
    } else if (config.type == 'label') {
      if (element != null) {
        element.innerHTML = this.formatLabel(state, config);
      }
    } else if (config.type == 'gates') {
      var closed =
        state.includes('OFF') ||
        state.includes('CLOSED') ||
        (!isNaN(parseInt(state)) && (parseInt(state) == 0 || parseInt(state) == 23));

      if (config.display.tiny) {
        image = closed ? this.config.gates.imageClosedTiny : this.config.gates.imageOpenTiny;
      } else {
        image = closed ? this.config.gates.imageClosed : this.config.gates.imageOpen;
      }

      if (element != null) {
        element.innerHTML = "<img src='" + this.file('/images/' + image) + "' />";
      }
    }
  },

  fadeMotionImage: function (index, fadeIntervalS, config) {
    // Inside this function, 'this' seems to have the scope of the whole Magic Mirror, not just this module
    // Must be because the SetInterval function is a Window level operation ?
    // Means that you can't easily use variables of this module.

    // Get interval in seconds since motion was last seen
    // console.log("Fading motion image for index " + String(index) );
    // console.log("Config of " + JSON.stringify(config) );
    // console.log("Lastchanged of " + String(config.lastChanged ));
    interval = (Date.now() - config.lastChanged) / 1000;
    opacityVal = 1 - interval / fadeIntervalS;

    var element = document.getElementById('mqtt_' + index);
    element.style.opacity = opacityVal <= 0 ? 0 : opacityVal;
    if (element.style.opacity <= 0) {
      // clearInterval(this.config.timerVars[index]);
      // Cannot get a reference to the handle inside here to clear the Interval
    }
  },

  formatLabel: function (value, config) {
    var formattedValue = value;

    if (!isNaN(config.display.decimals) && !isNaN(value)) {
      formattedValue = parseFloat(value).toFixed(config.display.decimals);
    }
    return (
      (typeof config.display.prefix !== 'undefined' ? config.display.prefix : '') +
      formattedValue +
      (typeof config.display.suffix !== 'undefined' ? config.display.suffix : '')
    );
  },

  setVisible: function (id, value) {
    var element = document.getElementById(id);
    if (element != null) {
      element.style.display = value ? 'block' : 'none';
      element.style.opacity = 1;
    }
  },

  appendSensors: function (floorplan) {
    for (var index in this.config.subscriptions) {
      var display = this.config.subscriptions[index].display;
      var type = this.config.subscriptions[index].type;

      display.label = this.config.subscriptions[index].label;

      if (type == 'door') floorplan.appendChild(this.getDoorDivImage(index, display));
      if (type == 'light') floorplan.appendChild(this.getLightDiv(index, display));
      if (type == 'label') floorplan.appendChild(this.getLabelDiv(index, display));
      if (type == 'gates') floorplan.appendChild(this.getGatesDiv(index, display));
      if (type == 'motion') floorplan.appendChild(this.getMotionDiv(index, display));
    }
  },

  getLightDiv: function (index, position) {
    // set style: display
    var style =
      'margin-left:' +
      position.left +
      'px;margin-top:' +
      position.top +
      'px;position:absolute;' +
      'height:' +
      this.config.light.height +
      'px;width:' +
      this.config.light.width +
      'px;';

    // create div, set style and text
    var el = document.createElement('div');
    el.id = 'mqtt_' + index;
    el.classList.add('MQTT-floorplan__light');
    el.setAttribute('data-name', position.label);
    el.style.cssText = style;
    el.style.display = this.config.light.defaultStatus;
    el.innerHTML =
      "<img src='" +
      this.file('/images/' + this.config.light.image) +
      "' style='" +
      'height:' +
      this.config.light.height +
      'px;width:' +
      this.config.light.width +
      "px;'/>";
    return el;
  },

  getGatesDiv: function (index, position) {
    // set style: display
    width = position.tiny ? this.config.gates.widthTiny : this.config.gates.width;
    height = position.tiny ? this.config.gates.heightTiny : this.config.gates.height;

    var style =
      'margin-left:' +
      position.left +
      'px;margin-top:' +
      position.top +
      'px;position:absolute;' +
      'height:' +
      height +
      'px;width:' +
      width +
      'px;';

    // create div, set style and text
    var el = document.createElement('div');
    el.id = 'mqtt_' + index;
    el.classList.add('MQTT-floorplan__gate');
    el.setAttribute('data-name', position.label);
    el.style.cssText = style;
    image = position.tiny ? this.config.gates.imageClosedTiny : this.config.gates.imageClosed;
    el.innerHTML =
      "<img src='" +
      this.file('/images/' + image) +
      "' style='" +
      'height:' +
      height +
      'px;width:' +
      width +
      "px;'/>";
    return el;
  },

  getLabelDiv: function (index, labelConfig) {
    // default color and size, but may be overridden for each label
    var color = this.getSpecificOrDefault(labelConfig.color, this.config.label.defaultColor);
    var size = this.getSpecificOrDefault(labelConfig.size, this.config.label.defaultSize);

    // set style: display, color, font size
    var style =
      'margin-left:' + labelConfig.left + 'px;margin-top:' + labelConfig.top + 'px;position:absolute;';
    style += 'color:' + color + ';font-size:' + size + ';';

    // create div, set style and text
    var el = document.createElement('div');
    el.id = 'mqtt_' + index;
    el.classList.add('MQTT-floorplan__label');
    el.setAttribute('data-name', labelConfig.label);
    el.style.cssText = style;
    el.innerHTML = '&hellip; &hellip;';
    return el;
  },

  getMotionDiv: function (index, position) {
    width = position.tiny ? this.config.motion.widthTiny : this.config.motion.width;
    height = position.tiny ? this.config.motion.heightTiny : this.config.motion.height;
    image = position.tiny ? this.config.motion.imageTiny : this.config.motion.image;

    // set style: display
    var style =
      'margin-left:' +
      position.left +
      'px;margin-top:' +
      position.top +
      'px;position:absolute;' +
      'height:' +
      height +
      'px;width:' +
      width +
      'px;';

    // create div, set style and text
    var el = document.createElement('div');
    el.id = 'mqtt_' + index;
    el.classList.add('MQTT-floorplan__motion');
    el.setAttribute('data-name', position.label);
    el.style.cssText = style;
    el.style.display = 'none'; // Always default to hidden - only display if get a message
    el.innerHTML =
      "<img src='" +
      this.file('/images/' + image) +
      "' style='" +
      'height:' +
      height +
      'px;width:' +
      width +
      "px;'/>";
    return el;
  },

  getDoorDivImage: function (index, position) {
    // set style: display
    // This version handles doors as images, not quadrants of a circle
    var style =
      'margin-left:' +
      position.left +
      'px;margin-top:' +
      position.top +
      'px;position:absolute;' +
      'height:' +
      this.config.door.height +
      'px;width:' +
      this.config.door.width +
      'px;';

    // create div, set style and text
    var el = document.createElement('div');
    el.id = 'mqtt_' + index;
    el.classList.add('MQTT-floorplan__door');
    el.setAttribute('data-name', position.label);
    el.style.cssText = style;
    el.innerHTML =
      "<img src='" +
      this.file('/images/' + this.config.door.imageClosed) +
      "' style='" +
      'height:' +
      this.config.door.height +
      'px;width:' +
      this.config.door.width +
      "px;'/>";
    return el;
  },

  getSpecificOrDefault: function (specificValue, defaultValue) {
    if (typeof specificValue !== 'undefined') return specificValue; // specific value is defined, so use that one!
    return defaultValue; // no specific value defined, use default value
  },
});
