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
/*
const Layer = function(features) {
  this.features = features;
  this.name = features.map((feature) => feature.attrs.properties.name).slice(0,4).join(', ')  + (features.length > 4 ? ',...' : '');
  this.style = {}
  this.fillColor = '#fe4291';
  this.color = '#444444';
}

Layer.prototype = new Publisher();

Layer.prototype.setStyle = function(key, value) {
  this.style[key] = value;
  this.notify('layer.restyled', this);
}

Layer.prototype.toGeoJSON = function() {
  return {
    type: 'FeatureCollection',
    features: this.features.map((feature) => feature.toGeoJSON())
  };
}
*/
//-------------------------------------------------
const Layer = function(features) {
  const that = Object.create(new Publisher());

  that.style = {};

  that.name = features.map((feature) => feature.attrs.properties.name).slice(0,4).join(', ')  + (features.length > 4 ? ',...' : '');

  that.setStyle = function(key, value) {
    that.style[key] = value;
    that.notifySuscriptors('layer.restyled', that);
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

// PropertiesView
const PropertiesView = function(layer, domId) {
  this.layer = layer;
  this.domId = domId;
}

PropertiesView.prototype.initializeColorPicker = function(rootNode) {
  const colors = [
   '#179e99',
   '#1dadee',
   '#7f4196',
   '#29dfd7',
   '#afd634',
   '#fecb30',
   '#df5290',
   '#fd7430'
  ];
  Array.prototype.slice.call(rootNode.querySelectorAll('.js-color')).map((option, index) => {
    option.style.backgroundColor = colors[index];
    option.addEventListener('click', (pickedColor) => {
      this.layer.setStyle('fillColor', colors[index]);//pickedColor.target.style.backgroundColor);
    });
  });
}

PropertiesView.prototype.initializeWidthRange = function(rootNode) {
  const input = rootNode.querySelector('#input-width');
  input.addEventListener('input', (event) => {
    console.log(input.value);
    this.layer.setStyle('radius', input.value);
  });
}

PropertiesView.prototype.render = function() {
  const template = document.querySelector('#properties-template');
  template.content.querySelector("#layer-on-properties").innerHTML = this.layer.name;

  var templateCopy = document.importNode(template.content, true);

  const root = document.getElementById(this.domId);

  this.initializeColorPicker(templateCopy);
  this.initializeWidthRange(templateCopy);
  root.innerHTML = '';
  root.appendChild(templateCopy);
}

// App initialization

const start = (geojson) => {
  const features = geojson.features.map((feature) => new Feature(feature));


  const onToggleCallback = (selectedFeature) => {
    layers.add(Layer(selectedFeature));
  }

  const selectFeatureViewBuilder = (feature) => new SelectFeatureView(feature, onToggleCallback);
  new ListView(features, 'features', selectFeatureViewBuilder).render();

  const onLayerClick = (layer) => new PropertiesView(layer, 'properties').render();
  const layerViewBuilder = (layer) => new SelectLayerView(layer, onLayerClick);
  new ListView(layers, 'layers', layerViewBuilder).render();
}

const layers = Layers();
const map = new Map(layers, 'mapbox.streets');
map.render(MAP_DOM_ID);

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));
