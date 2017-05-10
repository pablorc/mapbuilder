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

  const self = new Object();
  self.subscribe = (observer) => handlers.push(observer);
  self.notifySuscriptors = (...args) => handlers.map((handler) => handler.notify(...args))

  return self;
}

// Layers
const Layers = function() {
  const layers = [];

  const self = Object.create(new Publisher());

  self.add = (layer) => {
    layers.push(layer);
    layer.subscribe(self);
    self.notifySuscriptors('layer.added', layer);
  };

  self.notify = (event, subject) => {
    self.notifySuscriptors(event, subject)
  }

  self.map = (callback) => layers.map(callback);
  self.length = () => layers.length;
  self.getLayer = (index) => layers[index];

  return self;
};

// Feature
const Feature = function(attrs) {
  const self = new Object();

  self.toGeoJSON = () => attrs;
  self.getName = () => attrs.properties.name;

  return self;
}

// Layer
const Layer = function(features) {
  const self = Object.create(new Publisher());

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

  self.name = features.map((feature) => feature.getName()).slice(0,4).join(', ')  + (features.length > 4 ? ',...' : '');

  self.setStyle = (key, value) => {
    style[preferredStyle][key] = value;
    self.notifySuscriptors('layer.restyled', self);
  }

  self.setName = (name) => {
    self.name = name;
    self.notifySuscriptors('layer.renamed', self);
  }

  self.getStyle = () => style[preferredStyle];

  self.toGeoJSON = () => {
    return {
      type: 'FeatureCollection',
      features: features.map((feature) => feature.toGeoJSON())
    };
  }

  self.setPreferredStyle = (style) => {
    preferredStyle = style;
    self.notifySuscriptors('layer.restyled', self);
  }

  self.getPreferredStyle = () => preferredStyle;

  return self;
}

// View object

// Map
const Map = function(layers, id) {
  this.layers = layers;

  const self = new Object();
  layers.subscribe(self);

  self.notify = (event, layer) => {
    const events = {
      'layer.added': () => self.addLayer(layer),
      'layer.restyled': () => self.resetLayer(layer),
    }

    if (event in events) {
      events[event]();
    }
  }

  self.resetLayer = (layer) => {
    self.map.eachLayer((layer) => layer !== self.baseLayer ? self.map.removeLayer(layer) : '');
    layers.map((layer) => self.addLayer(layer));
  }

  self.icons = () => {
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

  self.render = (domID) => {
    self.map = L.map(domID).setView([5,0], 2);
    self.baseLayer = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        id: id,
        accessToken: MAPBOX_ACCESS_TOKEN
        }).addTo(self.map);
  };

  self.prepareFeature = (latlng, layer) => {
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
      return L.marker(latlng, { icon: self.icons()[style.image] });
    }
  }

  self.addLayer = (layer) => {
    L.geoJSON(layer.toGeoJSON(), {
      pointToLayer: (feature, latlng) => self.prepareFeature(latlng, layer)
    }).addTo(self.map);
  };

  return self;
};


// SelectedLayerView
const SelectLayerView = (layer, onClickCallback) => {
  const self = new Object();
  layer.subscribe(self);

  self.notify = (event, subject) => {
    self.render();
  }

  self.render = () => {
    const li = document.createElement('li');
    li.classList = 'item-list__item';
    const textNode = document.createTextNode(layer.name);
    li.appendChild(textNode);
    li.addEventListener('click', () => onClickCallback(layer));
    return li;
  }

  return self;
}

// SelectedFeatureView
const SelectFeatureView = function(feature, onToggleCallback, selected) {
  const self = new Object();

  self.render = () => {
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

  return self;
}

// ListView
const ListView = function(items, domId, itemBuilder) {
  const self = new Object();
  items.subscribe && items.subscribe(self);

  self.notify = (event, subject) => self.render();

  self.render = () => {
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

  return self;
}

// PickerView
const PickerView = function(layer, $el, style, options, optionBuilder) {
  const self = new Object();

  self.render = () => {
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
  return self;
}

NumberSelectorView = function(layer, $el, style, value, maxSize, step = 1) {
  const self = new Object();

  self.render = () => {
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
  return self;
}

// PropertiesView
const PropertiesView = function(layers, domId) {
  const self = new Object();
  let layer;
  layers.subscribe(self);

  self.changeLayer = (newLayer) => {
    layer = newLayer;
    self.render();
  }

  self.notify = (event, layer) => {
    if (event === 'layer.added') {
      //this.changeLayer(layer);
    }
  }

  self.render = () => {
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

    CirclePropertiesView(layers, layer, templateCopy.querySelector('.js-properties-marker')).render();

    const $select = templateCopy.querySelector('.js-select');
    $select.value = layer.getPreferredStyle();

    root.innerHTML = '';
    root.appendChild(templateCopy);

    const setProperties = () => {
      layer.setPreferredStyle($select.value);
      if ($select.value === 'image') {
        ImagePropertiesView(layers, layer, document.querySelector('.js-properties-marker')).render();
      } else {
        CirclePropertiesView(layers, layer, document.querySelector('.js-properties-marker')).render();
      }
    }
    $select.addEventListener('change', setProperties);
    setProperties(layer.getPreferredStyle());
  }
  return self;
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

ImagePropertiesView = function(layers, layer, $el) {
  const self = new Object();

  self.render = () => {
    const template = document.querySelector('#image-marker');
    var templateCopy = document.importNode(template.content, true);

    PickerView(layer, templateCopy.querySelector('.js-image-picker'), 'image', IMAGES, ImageToPickBuilder).render();

    $el.innerHTML = '';
    $el.appendChild(templateCopy);
  }

  return self;
}

CirclePropertiesView = function(layers, layer, $el) {
  const self = new Object();

  self.render = () => {
    if (!layer) {
      return;
    }

    const template = document.querySelector('#circle-marker');
    var templateCopy = document.importNode(template.content, true);

    PickerView(layer, templateCopy.querySelector('.js-stroke-color-picker'), 'color', COLORS, ColorToPickBuilder).render();
    PickerView(layer, templateCopy.querySelector('.js-fill-color-picker'), 'fillColor', COLORS, ColorToPickBuilder).render();
    NumberSelectorView(layer, templateCopy.querySelector('.js-radius'), 'radius', 8, 50).render();
    NumberSelectorView(layer, templateCopy.querySelector('.js-weight'), 'weight', 1, 20).render();
    NumberSelectorView(layer, templateCopy.querySelector('.js-opacity'), 'opacity', 0, 1, 0.1).render();

    $el.innerHTML = '';
    $el.appendChild(templateCopy);
  }
  return self;
}

// App initialization
const MainSidebar = function(layers, $el, features) {
  const self = new Object();

  self.render = () => {
    const template = document.querySelector('#main-sidebar');

    var templateCopy = document.importNode(template.content, true);
    $el.innerHTML = '';
    $el.appendChild(templateCopy);
    const $addLayer = document.querySelector('.js-add-layer');
    $addLayer.addEventListener('click', () => AddLayer(layers, $el, features).render());

    let properties = PropertiesView(layers, 'properties');
    const propertiesLayer = layers.getLayer(layers.length() - 1);
    properties.changeLayer(propertiesLayer);
    const onLayerClick = (layer) => properties.changeLayer(layer);
    const layerViewBuilder = (layer) => SelectLayerView(layer, onLayerClick);
    ListView(layers, 'layers', layerViewBuilder).render();
  }
  return self;
}

AddLayer = function(layers, $el, features) {
  const self = new Object();
  let selectedFeatures = [];

  self.render = () => {
    const template = document.querySelector('#add-layer');
    var templateCopy = document.importNode(template.content, true);
    $el.innerHTML = '';
    $el.appendChild(templateCopy);

    const onToggleCallback = ($el, selectedFeature) => {
      const selectedClass = 'item-list__item--is-selected';
      if ($el.classList.contains(selectedClass)) {
        const indexToRemove = selectedFeatures.indexOf(selectedFeature);
        selectedFeatures.splice(indexToRemove, 1);
        $el.classList.remove(selectedClass);
      } else {
        $el.classList.add(selectedClass);
        selectedFeatures.push(selectedFeature);
      }

      const selectFeatureViewBuilder = (feature) => SelectFeatureView(feature, () => {}, true);
      ListView(selectedFeatures, 'new-layer', selectFeatureViewBuilder).render();
    };
    const selectFeatureViewBuilder = (feature) => SelectFeatureView(feature, onToggleCallback);
    ListView(features, 'features', selectFeatureViewBuilder).render();

    const $cancel = document.querySelector('.js-cancel');
    $cancel.addEventListener('click', () => MainSidebar(layers, $el, features).render());

    const $save = document.querySelector('.js-save');
    $save.addEventListener('click', () => {
      layers.add(Layer(selectedFeatures));
      MainSidebar(layers, $el, features).render();
    });
  }
  return self;
}

const start = (geojson) => {
  const features = geojson.features.map((feature) => Feature(feature));

  AddLayer(layers, document.querySelector('.js-sidebar'), features).render();
}

const layers = Layers();
const map = Map(layers, 'mapbox.streets');
map.render(MAP_DOM_ID);

self.fetch(GEOJSON_URL)
  .then((response) => response.json().then(start));
