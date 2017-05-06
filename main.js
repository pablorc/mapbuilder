var MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoicGFibG9yYyIsImEiOiJjajI3djNyOXAwMGR3MndzMWV2cjJicHo3In0.EIxpAD7wO3gmdkqt4ozKbg';
var GEOJSON_URL = 'https://xavijam.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20ne_10m_populated_places_simple&format=GeoJSON';
var MAP_DOM_ID = 'map';

var Map = function(layers) {
  this.layers = layers;
};

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

var Point = function(attrs) {
  this.attrs = attrs;
  this.isShown = false;
};

Point.prototype.toGeoJSON = function() {
  return this.attrs;
}

var Layer = function(layer) {
  this.layer = layer;
}

Layer.prototype.toGeoJSON = function() {
  return {
    type: 'FeatureCollection',
    features: this.layer.map((feature) => feature.toGeoJSON())
  };
}

var SelectFeatureView = function(feature, onToggleCallback) {
  this.feature = feature;
  this.onToggleCallback = onToggleCallback;
}

SelectFeatureView.prototype.render = function() {
  var li = document.createElement('li');
  var textNode = document.createTextNode(this.feature.attrs.properties.name);
  li.appendChild(textNode);
  li.addEventListener('click', () => this.onToggleCallback(this.feature));
  return li;
}

var ListView = function(items) {
  this.items = items;
}

ListView.prototype.render = function(domId, onToggleCallback, itemBuilder) {
  var renderedPoints = this.items.map((item) => itemBuilder(item).render());
  var ul = document.createElement('ul');
  var append = (child) => ul.appendChild(child);
  renderedPoints.map((child) => append(child));
  document.getElementById(domId).appendChild(ul);
}

const start = (geojson) => {
  var features = geojson.features.map((feature) => new Point(feature));
  var layers = [];
  var map = new Map(layers);
  map.render(MAP_DOM_ID);

  var onToggleCallback = (selectedFeature) => map.addLayer(new Layer([selectedFeature]));

  var selectFeatureViewBuilder = (feature) => new SelectFeatureView(feature, onToggleCallback);
  new ListView(features).render('features', onToggleCallback, selectFeatureViewBuilder);

  var layerViewBuilder = (layer) => new SelectFeatureView(feature, onToggleCallback); // TODO: A medias
  new ListView(layers).render('layers', onToggleCallback, selectFeatureViewBuilder);
}

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));
