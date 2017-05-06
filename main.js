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
  that.notify = (...args) => handlers.map((handler) => handler.notify(...args))

  return that;
}

// Layers
const Layers = function() {
  const layers = [];

  const that = Object.create(new Publisher());

  that.add = (layer) => {
    layers.push(layer);
    that.notify('layer.added', layer);
  };

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
  this.features = features;
  this.name = features.map((feature) => feature.attrs.properties.name).join(', ');
}

Layer.prototype.toGeoJSON = function() {
  return {
    type: 'FeatureCollection',
    features: this.features.map((feature) => feature.toGeoJSON())
  };
}

// View object

// Map
const Map = function(layers) {
  this.layers = layers;
  layers.subscribe(this);
};

Map.prototype.notify = function(event, subject) {
  console.log(subject);
  this.addLayer(subject);
}

Map.prototype.render = function(domID) {
  console.log(this.domId)
  this.map = L.map(domID).setView([5,0], 2);
  L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
      id: 'mapbox.streets',
      accessToken: MAPBOX_ACCESS_TOKEN
      }).addTo(this.map);
};

Map.prototype.addLayer = function(layer) {
  L.geoJSON(layer.toGeoJSON()).addTo(this.map);
};

// SelectedLayerView
const SelectLayerView = function(layer) {
  this.layer = layer;
  this.onToggleCallback = () => {};
}

SelectLayerView.prototype.render = function() {
  const li = document.createElement('li');
  const textNode = document.createTextNode(this.layer.name);
  li.appendChild(textNode);
  li.addEventListener('click', () => this.onToggleCallback(this.layer));
  return li;
}

// SelectedFeatureView
const SelectFeatureView = function(feature, onToggleCallback) {
  this.feature = feature;
  this.onToggleCallback = onToggleCallback;
}

SelectFeatureView.prototype.render = function() {
  const li = document.createElement('li');
  const textNode = document.createTextNode(this.feature.attrs.properties.name);
  li.appendChild(textNode);
  li.addEventListener('click', () => this.onToggleCallback(this.feature));
  return li;
}

// ListView
const ListView = function(items,domId, itemBuilder) {
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

// App initialization

const start = (geojson) => {
  const features = geojson.features.map((feature) => new Feature(feature));

  const onToggleCallback = (selectedFeature) => layers.add(new Layer([selectedFeature]));

  const selectFeatureViewBuilder = (feature) => new SelectFeatureView(feature, onToggleCallback);
  new ListView(features, 'features', selectFeatureViewBuilder).render();

  const layerViewBuilder = (layer) => new SelectLayerView(layer, () => {});
  new ListView(layers, 'layers', layerViewBuilder).render();
}

const layers = Layers();
const map = new Map(layers);
map.render(MAP_DOM_ID);

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));

const previewLayers = Layers();
const previewMap = new Map(previewLayers);
previewMap.render(PREVIEW_MAP_DOM_ID);
