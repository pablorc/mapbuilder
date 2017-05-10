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
  this.attrs = attrs;
};

Feature.prototype.toGeoJSON = function() {
  return this.attrs;
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

  that.name = features.map((feature) => feature.attrs.properties.name).slice(0,4).join(', ')  + (features.length > 4 ? ',...' : '');

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

Map.prototype.icons = function() {
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

Map.prototype.render = function(domID) {
  this.map = L.map(domID).setView([5,0], 2);
  this.baseLayer = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
      id: this.id,
      accessToken: MAPBOX_ACCESS_TOKEN
      }).addTo(this.map);
};

Map.prototype.prepareFeature = function(latlng, layer) {
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
    return L.marker(latlng, { icon: this.icons()[style.image] });
  }
}

Map.prototype.addLayer = function(layer) {
	L.geoJSON(layer.toGeoJSON(), {
		pointToLayer: (feature, latlng) => this.prepareFeature(latlng, layer)
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
  li.classList = 'item-list__item';
  const textNode = document.createTextNode(this.layer.name);
  li.appendChild(textNode);
  li.addEventListener('click', () => this.onClickCallback(this.layer));
  return li;
}

// SelectedFeatureView
const SelectFeatureView = function(feature, onToggleCallback, selected) {
  this.feature = feature;
  this.onToggleCallback = onToggleCallback;
  this.selected = selected;
}

const setSelected = function(selected) {
  this.selected = selected;
  if (this.li) {
    this.render();
  }
}

SelectFeatureView.prototype.render = function() {
  this.li = document.createElement('li');
  this.li.classList = 'item-list__item';
  if (this.selected) {
    this.li.classList.add('item-list__item--is-selected');
  }
  const textNode = document.createTextNode(this.feature.attrs.properties.name);
  this.li.appendChild(textNode);
  this.li.addEventListener('click', () => this.onToggleCallback(this.li, this.feature));
  return this.li;
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
  ul.classList = 'item-list';
  const append = (child) => ul.appendChild(child);
  renderedPoints.map((child) => append(child));

  const $el = document.getElementById(this.domId)
  if ($el) {
    $el.innerHTML = '';
    $el.appendChild(ul);
  }
}

// PickerView
const PickerView = function(layer, $el, style, options, optionBuilder) {
  this.layer = layer;
  this.$el = $el;
  this.style = style;
  this.options = options;
  this.optionBuilder = optionBuilder;
}

PickerView.prototype.render = function() {
  const template = document.querySelector('#color-picker');
  const templateCopy = document.importNode(template.content, true);
  const $root = templateCopy.querySelector('.js-color-picker');
  const isSelectedClass = '--is-selected';

  const colorOptions = this.options.map((color) => {
    const option = this.optionBuilder(this.layer, color);
    if (color === this.layer.getStyle()[this.style]) {
      option.classList.add(isSelectedClass);
    }
    $root.appendChild(option);
    option.addEventListener('click', (event) => {
      const nodes = this.$el.querySelectorAll('.js-option');
      [].forEach.call(nodes, (color) => color.classList.remove(isSelectedClass));
      event.target.classList.add(isSelectedClass);
      this.layer.setStyle(this.style, color);
    });
  });

  this.$el.innerHTML = '';
  this.$el.appendChild(templateCopy);
}

ImageSelector = function(layer, $el, style) {
  this.layer = layer;
  this.$el = $el;
  this.style = style;
}

ImageSelector.prototype.render = function() {
  const template = document.querySelector('#image-picker');
  const templateCopy = document.importNode(template.content, true);
  const $root = templateCopy.querySelector('.js-image-picker');
  const colorTemplate = document.querySelector('#image-picker-option');

  const colorOptions = IMAGES.map((image) => {
    const colorOptionCopy = document.importNode(colorTemplate.content, true);
    const option = colorOptionCopy.querySelector('.js-image');
    option.setAttribute('src',  image);
    if (image === this.layer.getStyle()[this.style]) {
      option.classList.add('image-picker__option__color--is-selected');
    }
    option.addEventListener('click', () => {
      //this.layer.setStyle(this.style, image);
    });
    $root.appendChild(colorOptionCopy);
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
    //this.changeLayer(layer);
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

  const $nameInput = templateCopy.querySelector('.js-name');
  $nameInput.setAttribute('value', this.layer.name);
  $nameInput.addEventListener('keyup', () => this.layer.setName($nameInput.value));

  new CirclePropertiesView(this.layers, this.layer, templateCopy.querySelector('.js-properties-marker')).render();

  const $select = templateCopy.querySelector('.js-select');
  $select.value = this.layer.getPreferredStyle();

  root.innerHTML = '';
  root.appendChild(templateCopy);

  const setProperties = () => {
    this.layer.setPreferredStyle($select.value);
    if ($select.value === 'image') {
      new ImagePropertiesView(this.layers, this.layer, document.querySelector('.js-properties-marker')).render();
    } else {
      new CirclePropertiesView(this.layers, this.layer, document.querySelector('.js-properties-marker')).render();
    }
  }
  $select.addEventListener('change', setProperties);
  setProperties(this.layer.getPreferredStyle());
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
  new NumberSelectorView(this.layer, templateCopy.querySelector('.js-radius'), 'radius', 8, 50).render();
  new NumberSelectorView(this.layer, templateCopy.querySelector('.js-weight'), 'weight', 1, 20).render();
  new NumberSelectorView(this.layer, templateCopy.querySelector('.js-opacity'), 'opacity', 0, 1, 0.1).render();

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
  const propertiesLayer = layers.getLayer(layers.length() - 1);
  this.properties.changeLayer(propertiesLayer);
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

    const selectFeatureViewBuilder = (feature) => new SelectFeatureView(feature, () => {}, true);
    new ListView(this.selectedFeatures, 'new-layer', selectFeatureViewBuilder).render();
  };
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

  new AddLayer(layers, document.querySelector('.js-sidebar'), features).render();
}

const layers = Layers();
const map = new Map(layers, 'mapbox.streets');
map.render(MAP_DOM_ID);

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));
