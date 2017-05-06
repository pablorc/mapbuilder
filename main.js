const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoicGFibG9yYyIsImEiOiJjajI3djNyOXAwMGR3MndzMWV2cjJicHo3In0.EIxpAD7wO3gmdkqt4ozKbg';
const GEOJSON_URL = 'https://xavijam.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20ne_10m_populated_places_simple&format=GeoJSON';
const MAP_DOM_ID = 'map';

// Map
const Map = function(layers) {
  this.layers = layers;
  layers.subscribe(this);
};

Map.prototype.notify = function(event, subject) {
  this.addLayer(subject);
}

Map.prototype.render = function(domID) {
  this.map = L.map(domID).setView([5,0], 2);
  L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
      id: 'mapbox.streets',
      accessToken: MAPBOX_ACCESS_TOKEN
      }).addTo(this.map);
};

Map.prototype.addLayer = function(layer) {
  L.geoJSON(layer.toGeoJSON()).addTo(this.map);
};

// Feature
const Feature = function(attrs) {
  this.attrs = attrs;
};

Feature.prototype.toGeoJSON = function() {
  return this.attrs;
}


// Layer
const Layer = function(layer) {
  this.layer = layer;
}

Layer.prototype.toGeoJSON = function() {
  return {
    type: 'FeatureCollection',
    features: this.layer.map((feature) => feature.toGeoJSON())
  };
}

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

const ListView = function(items) {
  this.items = items;
}

ListView.prototype.render = function(domId, onToggleCallback, itemBuilder) {
  const renderedPoints = this.items.map((item) => itemBuilder(item).render());
  const ul = document.createElement('ul');
  const append = (child) => ul.appendChild(child);
  renderedPoints.map((child) => append(child));
  document.getElementById(domId).appendChild(ul);
}

const Publisher = function() {
  let handlers = [];

  const that = new Object();
  that.subscribe = (observer) => handlers.push(observer);
  that.notify = (...args) => handlers.map((handler) => handler.notify(...args))

  return that;
}

const Layers = function() {
  const layers = [];

  const that = Object.create(new Publisher());

  that.add = (layer) => {
    layers.push(layer);
    that.notify('layer.added', layer);
  };

  return that;
};

const start = (geojson) => {
  const features = geojson.features.map((feature) => new Feature(feature));
  const layers = Layers();
  const map = new Map(layers);
  map.render(MAP_DOM_ID);

  const onToggleCallback = (selectedFeature) => layers.add(new Layer([selectedFeature]));

  const selectFeatureViewBuilder = (feature) => new SelectFeatureView(feature, onToggleCallback);
  new ListView(features).render('features', onToggleCallback, selectFeatureViewBuilder);

  const layerViewBuilder = (layer) => new SelectFeatureView(feature, () => {});
  new ListView(layers).render('layers', onToggleCallback, selectFeatureViewBuilder);
}

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));
