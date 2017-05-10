const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoicGFibG9yYyIsImEiOiJjajI3djNyOXAwMGR3MndzMWV2cjJicHo3In0.EIxpAD7wO3gmdkqt4ozKbg';
const GEOJSON_URL = 'https://xavijam.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20ne_10m_populated_places_simple&format=GeoJSON';
const MAP_DOM_ID = 'map';
const PREVIEW_MAP_DOM_ID = 'preview-map';
const COLORS = [
   '#179e99',
   '#1dadee',
   '#7f4196',
   '#29dfd7',
   '#afd634',
   '#fecb30',
   '#df5290',
   '#fd7430'
];
const IMAGES = ['home', 'camera', 'plane', 'briefcase'].map((filename) => `png/${filename}.png`);

// Model objects

// Publisher
const Publisher = function() {
  let handlers = [];

  const that = new Object();
  that.subscribe = (observer) => handlers.push(observer);
  that.notifySuscriptors = (...args) => handlers.map((handler) => handler.notify(...args))

  return that;
}

// Layers
const Layers = function() {
  const layers = [];

  const that = Object.create(new Publisher());

  that.add = (layer) => {
    layers.push(layer);
    layer.subscribe(that);
    that.notifySuscriptors('layer.added', layer);
  };

  that.notify = (event, subject) => {
    that.notifySuscriptors(event, subject)
  }

  that.map = (callback) => layers.map(callback);
  that.length = () => layers.length;
  that.getLayer = (index) => layers[index];

  return that;
};

// Feature
const Feature = function(attrs) {
  const that = new Object();

  that.toGeoJSON = () => attrs;
  that.getName = () => attrs.properties.name;

  return that;
}

// Layer
const Layer = function(features) {
  const that = Object.create(new Publisher());

  let preferredStyle = 'circle';
  const style = {
    circle: {
      fillColor: COLORS[0],
      color: COLORS[1]
    },
    image: {
      image: IMAGES[0]
    }
  };

  that.name = features.map((feature) => feature.getName()).slice(0,4).join(', ')  + (features.length > 4 ? ',...' : '');

  that.setStyle = function(key, value) {
    style[preferredStyle][key] = value;
    that.notifySuscriptors('layer.restyled', that);
  }

  that.setName = (name) => {
    that.name = name;
    that.notifySuscriptors('layer.renamed', that);
  }

  that.getStyle = () => style[preferredStyle];

  that.toGeoJSON = function() {
    return {
      type: 'FeatureCollection',
      features: features.map((feature) => feature.toGeoJSON())
    };
  }

  that.setPreferredStyle = function(style) {
    preferredStyle = style;
    that.notifySuscriptors('layer.restyled', that);
  }

  that.getPreferredStyle = () => preferredStyle;

  return that;
}

// View object

// Map
const Map = function(layers, id) {
  this.layers = layers;

  const that = new Object();
  layers.subscribe(that);

  that.notify = function(event, layer) {
    const events = {
      'layer.added': () => that.addLayer(layer),
      'layer.restyled': () => that.resetLayer(layer),
    }

    if (event in events) {
      events[event]();
    }
  }

  that.resetLayer = function(layer) {
    that.map.eachLayer((layer) => layer !== that.baseLayer ? that.map.removeLayer(layer) : '');
    layers.map((layer) => that.addLayer(layer));
  }

  that.icons = function() {
    return IMAGES.reduce((dict, filename) => {
      dict[filename] = L.icon({
        iconUrl: filename,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [-3, -76],
        shadowSize: [0, 0],
        shadowAnchor: [0, 0]
      });
      return dict;
    }, {});
  }

  that.render = function(domID) {
    that.map = L.map(domID).setView([5,0], 2);
    that.baseLayer = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        id: id,
        accessToken: MAPBOX_ACCESS_TOKEN
        }).addTo(that.map);
  };

  that.prepareFeature = function(latlng, layer) {
    const style = layer.getStyle();
    if (style.color) {
      const options = Object.assign({
        radius: 8,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      }, layer.getStyle());
      return L.circleMarker(latlng, options);
    } else {
      return L.marker(latlng, { icon: that.icons()[style.image] });
    }
  }

  that.addLayer = function(layer) {
    L.geoJSON(layer.toGeoJSON(), {
      pointToLayer: (feature, latlng) => that.prepareFeature(latlng, layer)
    }).addTo(that.map);
  };

  return that;
};


// SelectedLayerView
const SelectLayerView = function(layer, onClickCallback) {
  const that = new Object();
  layer.subscribe(that);

  that.notify = (event, subject) => {
    that.render();
  }

  that.render = () => {
    const li = document.createElement('li');
    li.classList = 'item-list__item';
    const textNode = document.createTextNode(layer.name);
    li.appendChild(textNode);
    li.addEventListener('click', () => onClickCallback(layer));
    return li;
  }

  return that;
}

// SelectedFeatureView
const SelectFeatureView = function(feature, onToggleCallback, selected) {
  const that = new Object();

  that.render = () => {
    const li = document.createElement('li');
    li.classList = 'item-list__item';
    if (selected) {
      li.classList.add('item-list__item--is-selected');
    }
    const textNode = document.createTextNode(feature.getName());
    li.appendChild(textNode);
    li.addEventListener('click', () => onToggleCallback(li, feature));
    return li;
  }

  return that;
}

// ListView
const ListView = function(items, domId, itemBuilder) {
  const that = new Object();
  items.subscribe && items.subscribe(that);

  that.notify = (event, subject) => that.render();

  that.render = () => {
    const renderedPoints = items.map((item) => itemBuilder(item).render());
    const ul = document.createElement('ul');
    ul.classList = 'item-list';
    const append = (child) => ul.appendChild(child);
    renderedPoints.map((child) => append(child));

    const $el = document.getElementById(domId);
    if ($el) {
      $el.innerHTML = '';
      $el.appendChild(ul);
    }
  }

  return that;
}

// PickerView
const PickerView = function(layer, $el, style, options, optionBuilder) {
  const that = new Object();

  that.render = function() {
    const template = document.querySelector('#color-picker');
    const templateCopy = document.importNode(template.content, true);
    const $root = templateCopy.querySelector('.js-color-picker');
    const isSelectedClass = '--is-selected';

    const colorOptions = options.map((color) => {
      const option = optionBuilder(layer, color);
      if (color === layer.getStyle()[style]) {
        option.classList.add(isSelectedClass);
      }
      $root.appendChild(option);
      option.addEventListener('click', (event) => {
        const nodes = $el.querySelectorAll('.js-option');
        [].forEach.call(nodes, (color) => color.classList.remove(isSelectedClass));
        event.target.classList.add(isSelectedClass);
        layer.setStyle(style, color);
      });
    });

    $el.innerHTML = '';
    $el.appendChild(templateCopy);
  }
  return that;
}

NumberSelectorView = function(layer, $el, style, value, maxSize, step = 1) {
  const that = new Object();

  that.render = () => {
    const template = document.querySelector('#number-selector');
    var templateCopy = document.importNode(template.content, true);
    const $input = templateCopy.querySelector('.js-input-number');
    $input.setAttribute('max',   maxSize);
    $input.setAttribute('value', value);
    $input.setAttribute('step',  step);

    $input.addEventListener('input', () => {
      layer.setStyle(style, $input.value);
    });

    $el.innerHTML = '';
    $el.appendChild(templateCopy);
  }
  return that;
}

// PropertiesView
const PropertiesView = function(layers, domId) {
  const that = new Object();
  let layer;
  layers.subscribe(that);

  that.changeLayer = function(newLayer) {
    layer = newLayer;
    that.render();
  }

  that.notify = function(event, layer) {
    if (event === 'layer.added') {
      //this.changeLayer(layer);
    }
  }

  that.render = function() {
    if (!layer) {
      return;
    }

    const template = document.querySelector('#properties-template');
    template.content.querySelector("#layer-on-properties").innerHTML = layer.name;

    var templateCopy = document.importNode(template.content, true);

    const root = document.getElementById(domId);

    const $nameInput = templateCopy.querySelector('.js-name');
    $nameInput.setAttribute('value', layer.name);
    $nameInput.addEventListener('keyup', () => layer.setName($nameInput.value));

    new CirclePropertiesView(layers, layer, templateCopy.querySelector('.js-properties-marker')).render();

    const $select = templateCopy.querySelector('.js-select');
    $select.value = layer.getPreferredStyle();

    root.innerHTML = '';
    root.appendChild(templateCopy);

    const setProperties = () => {
      layer.setPreferredStyle($select.value);
      if ($select.value === 'image') {
        new ImagePropertiesView(layers, layer, document.querySelector('.js-properties-marker')).render();
      } else {
        new CirclePropertiesView(layers, layer, document.querySelector('.js-properties-marker')).render();
      }
    }
    $select.addEventListener('change', setProperties);
    setProperties(layer.getPreferredStyle());
  }
  return that;
}

const ColorToPickBuilder = (layer, color, style) => {
  const colorTemplate = document.querySelector('#color-picker-option');
    const colorOptionCopy = document.importNode(colorTemplate.content, true);
    const option = colorOptionCopy.querySelector('.js-option');
    option.style.backgroundColor = color;
    return option;
}

const ImageToPickBuilder = (layer, color, style) => {
  const colorTemplate = document.querySelector('#image-picker-option');
  const colorOptionCopy = document.importNode(colorTemplate.content, true);
  const option = colorOptionCopy.querySelector('.js-option');
  option.setAttribute('src', color);
  return option;
}

ImagePropertiesView = function(layers, layer, domId) {
  this.layers =  layers;
  this.layer = layer;
  this.domId = domId;
}

ImagePropertiesView.prototype.render = function() {
  const template = document.querySelector('#image-marker');
  var templateCopy = document.importNode(template.content, true);

  const root = this.domId;

  new PickerView(this.layer, templateCopy.querySelector('.js-image-picker'), 'image', IMAGES, ImageToPickBuilder).render();

  root.innerHTML = '';
  root.appendChild(templateCopy);
}

CirclePropertiesView = function(layers, layer, domId) {
  this.layers =  layers;
  this.layer = layer;
  this.domId = domId;
}

CirclePropertiesView.prototype.render = function() {
  if (!this.layer) {
    return;
  }

  const template = document.querySelector('#circle-marker');
  var templateCopy = document.importNode(template.content, true);

  const root = this.domId;

  new PickerView(this.layer, templateCopy.querySelector('.js-stroke-color-picker'), 'color', COLORS, ColorToPickBuilder).render();
  new PickerView(this.layer, templateCopy.querySelector('.js-fill-color-picker'), 'fillColor', COLORS, ColorToPickBuilder).render();
  NumberSelectorView(this.layer, templateCopy.querySelector('.js-radius'), 'radius', 8, 50).render();
  NumberSelectorView(this.layer, templateCopy.querySelector('.js-weight'), 'weight', 1, 20).render();
  NumberSelectorView(this.layer, templateCopy.querySelector('.js-opacity'), 'opacity', 0, 1, 0.1).render();

  root.innerHTML = '';
  root.appendChild(templateCopy);
}

// App initialization
const MainSidebar = function(layers, $el, features) {
  this.layers = layers;
  this.$el = $el;
  this.features = features; //TODO: REMOVE
}

MainSidebar.prototype.render = function() {
  const template = document.querySelector('#main-sidebar');

  var templateCopy = document.importNode(template.content, true);
  this.$el.innerHTML = '';
  this.$el.appendChild(templateCopy);
  const $addLayer = document.querySelector('.js-add-layer');
  $addLayer.addEventListener('click', () => new AddLayer(this.layers, this.$el, this.features).render());

  this.properties = PropertiesView(layers, 'properties');
  const propertiesLayer = layers.getLayer(layers.length() - 1);
  this.properties.changeLayer(propertiesLayer);
  const onLayerClick = (layer) => this.properties.changeLayer(layer);
  const layerViewBuilder = (layer) => SelectLayerView(layer, onLayerClick);
  ListView(layers, 'layers', layerViewBuilder).render();
}

AddLayer = function(layers, $el, features) {
  this.layers = layers;
  this.$el = $el;
  this.features = features; //TODO: REMOVE
  this.selectedFeatures = [];
}

AddLayer.prototype.render = function() {
  const template = document.querySelector('#add-layer');
  var templateCopy = document.importNode(template.content, true);
  this.$el.innerHTML = '';
  this.$el.appendChild(templateCopy);

  const onToggleCallback = ($el, selectedFeature) => {
    const selectedClass = 'item-list__item--is-selected';
    if ($el.classList.contains(selectedClass)) {
      const indexToRemove = this.selectedFeatures.indexOf(selectedFeature);
      this.selectedFeatures.splice(indexToRemove, 1);
      $el.classList.remove(selectedClass);
    } else {
      $el.classList.add(selectedClass);
      this.selectedFeatures.push(selectedFeature);
    }

    const selectFeatureViewBuilder = (feature) => SelectFeatureView(feature, () => {}, true);
    ListView(this.selectedFeatures, 'new-layer', selectFeatureViewBuilder).render();
  };
  const selectFeatureViewBuilder = (feature) => SelectFeatureView(feature, onToggleCallback);
  ListView(this.features, 'features', selectFeatureViewBuilder).render();

  const $cancel = document.querySelector('.js-cancel');
  $cancel.addEventListener('click', () => new MainSidebar(this.layers, this.$el, this.features).render());

  const $save = document.querySelector('.js-save');
  $save.addEventListener('click', () => {
    layers.add(Layer(this.selectedFeatures));
    new MainSidebar(this.layers, this.$el, this.features).render();
  });
}

const start = (geojson) => {
  const features = geojson.features.map((feature) => Feature(feature));

  new AddLayer(layers, document.querySelector('.js-sidebar'), features).render();
}

const layers = Layers();
const map = Map(layers, 'mapbox.streets');
map.render(MAP_DOM_ID);

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));
