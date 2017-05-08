const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoicGFibG9yYyIsImEiOiJjajI3djNyOXAwMGR3MndzMWV2cjJicHo3In0.EIxpAD7wO3gmdkqt4ozKbg';
const GEOJSON_URL = 'https://xavijam.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20ne_10m_populated_places_simple&format=GeoJSON';
const MAP_DOM_ID = 'map';
const PREVIEW_MAP_DOM_ID = 'preview-map';

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

  return that;
};

// Feature
const Feature = function(attrs) {
  this.attrs = attrs;
};

Feature.prototype.toGeoJSON = function() {
  return this.attrs;
}

// Layer
const Layer = function(features) {
  const that = Object.create(new Publisher());

  that.style = {};

  that.name = features.map((feature) => feature.attrs.properties.name).slice(0,4).join(', ')  + (features.length > 4 ? ',...' : '');

  that.setStyle = function(key, value) {
    that.style[key] = value;
    that.notifySuscriptors('layer.restyled', that);
  }

  that.setName = (name) => {
    that.name = name;
    that.notifySuscriptors('layer.renamed', that);
  }

  that.toGeoJSON = function() {
    return {
      type: 'FeatureCollection',
      features: features.map((feature) => feature.toGeoJSON())
    };
  }

  return that;

}

// View object

// Map
const Map = function(layers, id) {
  this.layers = layers;
  this.id = id;
  layers.subscribe(this);
};

Map.prototype.notify = function(event, layer) {
  const events = {
    'layer.added': () => this.addLayer(layer),
    'layer.restyled': () => this.resetLayer(layer),
  }

  if (event in events) {
    events[event]();
  }
}

Map.prototype.resetLayer = function(layer) {
  this.map.eachLayer((layer) => layer !== this.baseLayer ? this.map.removeLayer(layer) : '');
  this.layers.map((layer) => this.addLayer(layer));
}

Map.prototype.render = function(domID) {
  this.map = L.map(domID).setView([5,0], 2);
  this.baseLayer = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
      id: this.id,
      accessToken: MAPBOX_ACCESS_TOKEN
      }).addTo(this.map);
};

Map.prototype.addLayer = function(layer) {
  const markerOptions = Object.assign({
    radius: 8,
    weight: 1,
    opacity: 1,
    fillOpacity: 0.8
  }, layer.style);

	L.geoJSON(layer.toGeoJSON(), {
		pointToLayer: (feature, latlng) => L.circleMarker(latlng, markerOptions)
	}).addTo(this.map);
};

// SelectedLayerView
const SelectLayerView = function(layer, onClickCallback) {
  this.layer = layer;
  this.onClickCallback = onClickCallback;
  this.layer.subscribe(this);
}

SelectLayerView.prototype.notify = function(event, subject) {
  this.render();
}

SelectLayerView.prototype.render = function() {
  const li = document.createElement('li');
  const textNode = document.createTextNode(this.layer.name);
  li.appendChild(textNode);
  li.addEventListener('click', () => this.onClickCallback(this.layer));
  return li;
}

// SelectedFeatureView
const SelectFeatureView = function(feature, onToggleCallback) {
  this.feature = feature; this.onToggleCallback = onToggleCallback;
}

SelectFeatureView.prototype.render = function() {
  const li = document.createElement('li');
  const textNode = document.createTextNode(this.feature.attrs.properties.name);
  li.appendChild(textNode);
  li.addEventListener('click', () => this.onToggleCallback(this.feature));
  return li;
}

// ListView
const ListView = function(items, domId, itemBuilder) {
  this.items = items;
  this.domId = domId;
  this.itemBuilder = itemBuilder;

  items.subscribe && items.subscribe(this);
}

ListView.prototype.notify = function(event, subject) {
  this.render();
}

ListView.prototype.render = function() {
  const renderedPoints = this.items.map((item) => this.itemBuilder(item).render());
  const ul = document.createElement('ul');
  const append = (child) => ul.appendChild(child);
  renderedPoints.map((child) => append(child));

  document.getElementById(this.domId).innerHTML = '';
  document.getElementById(this.domId).appendChild(ul);
}

// ColorPickerView
const ColorPickerView = function(layer, $el, style) {
  this.layer = layer;
  this.$el = $el;
  this.style = style;
  this.colors = [
   '#179e99',
   '#1dadee',
   '#7f4196',
   '#29dfd7',
   '#afd634',
   '#fecb30',
   '#df5290',
   '#fd7430'
  ];
}

ColorPickerView.prototype.render = function() {
  const template = document.querySelector('#color-picker');
  var templateCopy = document.importNode(template.content, true);

  Array.prototype.slice.call(templateCopy.querySelectorAll('.js-color')).map((option, index) => {
    option.style.backgroundColor = this.colors[index];
    option.addEventListener('click', (pickedColor) => {
      this.layer.setStyle(this.style, this.colors[index]);
    });
  });

  this.$el.innerHTML = '';
  this.$el.appendChild(templateCopy);
}

NumberSelectorView = function(layer, $el, style, value, maxSize, step) {
  this.layer = layer;
  this.$el = $el;
  this.style = style;
  this.maxSize = maxSize;
  this.value = value;
  this.step = step || 1;
}

NumberSelectorView.prototype.render = function() {
  const template = document.querySelector('#number-selector');
  var templateCopy = document.importNode(template.content, true);
  const $input = templateCopy.querySelector('.js-input-number');
  $input.setAttribute('max', this.maxSize);
  $input.setAttribute('value', this.value);
  $input.setAttribute('step', this.step);

  $input.addEventListener('input', () => {
    this.layer.setStyle(this.style, $input.value);
  });

  this.$el.innerHTML = '';
  this.$el.appendChild(templateCopy);
}

// PropertiesView
const PropertiesView = function(layers, domId) {
  this.domId = domId;
  layers.subscribe(this);
}

PropertiesView.prototype.changeLayer = function(layer) {
    this.layer = layer;
    this.render();
}
PropertiesView.prototype.notify = function(event, layer) {
  if (event === 'layer.added') {
    this.changeLayer(layer);
  }
}

PropertiesView.prototype.render = function() {
  if (!this.layer) {
    return;
  }

  const template = document.querySelector('#properties-template');
  template.content.querySelector("#layer-on-properties").innerHTML = this.layer.name;

  var templateCopy = document.importNode(template.content, true);

  const root = document.getElementById(this.domId);

  new ColorPickerView(this.layer, templateCopy.querySelector('.js-stroke-color-picker'), 'color').render();
  new ColorPickerView(this.layer, templateCopy.querySelector('.js-fill-color-picker'), 'fillColor').render();
  new NumberSelectorView(this.layer, templateCopy.querySelector('.js-radius'), 'radius', 8, 50).render();
  new NumberSelectorView(this.layer, templateCopy.querySelector('.js-weight'), 'weight', 1, 20).render();
  new NumberSelectorView(this.layer, templateCopy.querySelector('.js-opacity'), 'opacity', 0, 1, 0.1).render();

  const $nameInput = templateCopy.querySelector('.js-name');
  $nameInput.setAttribute('value', this.layer.name);
  $nameInput.addEventListener('keyup', () => this.layer.setName($nameInput.value));

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

  this.properties = new PropertiesView(layers, 'properties');
  this.properties.render();
  const onLayerClick = (layer) => this.properties.changeLayer(layer);
  const layerViewBuilder = (layer) => new SelectLayerView(layer, onLayerClick);
  new ListView(layers, 'layers', layerViewBuilder).render();
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

  const onToggleCallback = (selectedFeature) => this.selectedFeatures.push(selectedFeature);
  const selectFeatureViewBuilder = (feature) => new SelectFeatureView(feature, onToggleCallback);
  new ListView(this.features, 'features', selectFeatureViewBuilder).render();

  const $cancel = document.querySelector('.js-cancel');
  $cancel.addEventListener('click', () => new MainSidebar(this.layers, this.$el, this.features).render());

  const $save = document.querySelector('.js-save');
  $save.addEventListener('click', () => {
    layers.add(Layer(this.selectedFeatures));
    new MainSidebar(this.layers, this.$el, this.features).render();
  });
}

const start = (geojson) => {
  const features = geojson.features.map((feature) => new Feature(feature));

  new MainSidebar(layers, document.querySelector('.js-sidebar'), features).render();
}

const layers = Layers();
const map = new Map(layers, 'mapbox.light');
map.render(MAP_DOM_ID);

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));
