//// Settings

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

//// Model objects

/*
 * Implementation of a Observer pattern
 */
const Publisher = function() {
  let handlers = [];

  const self = new Object();
  self.subscribe = (observer) => handlers.push(observer);
  self.notifySuscriptors = (...args) => handlers.map((handler) => handler.notify(...args))

  return self;
}

/*
 * Represent a collection of layers.
 *
 * Notify layers added to it with a 'layer.added' event
 */
const Layers = function() {
  const layers = [];

  const self = Object.create(new Publisher());

  self.add = (layer) => {
    layers.push(layer);
    layer.subscribe(self);
    self.notifySuscriptors('layer.added', layer);
  };

  self.notify = (event, subject) =>  self.notifySuscriptors(event, subject);
  self.map = (callback) => layers.map(callback);
  self.length = () => layers.length;
  self.getLayer = (index) => layers[index];

  return self;
};

/*
 * Represents a feature
 * @param attrs Info in geoJSON format
 */
const Feature = function(attrs) {
  const self = new Object();

  self.toGeoJSON = () => attrs;
  self.getName = () => attrs.properties.name;

  return self;
}

/*
 * Represents a layer
 * @param features A list of features
 */
const Layer = function(features) {
  const self = Object.create(new Publisher());
  let name;
  let preferredStyle = 'circle';

  const getDefaultName = () => {
    const howManyEnumerate = 2;
    const tail = features.length > howManyEnumerate ? ` and ${features.length - howManyEnumerate} more` : '';
    const names = features.slice(0, howManyEnumerate).map((feature) => feature.getName());

    return names.join(', ') + tail;
  };

  const style = {
    circle: {
      fillColor: COLORS[0],
      color: COLORS[1],
      opacity: 1,
      fillOpacity: 1,
      weight: 1
    },
    image: {
      image: IMAGES[0]
    }
  };

  self.getName = () => name ? name : getDefaultName();

  self.setStyle = (key, value) => {
    style[preferredStyle][key] = value;
    self.notifySuscriptors('layer.restyled', self);
  }

  self.setName = (newName) => {
    name = newName;
    self.notifySuscriptors('layer.renamed', self);
  }

  self.getStyles = () => style[preferredStyle];

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

///// View objects

/*
 * Base class for Views
 */
const BaseView = function() {
  const self = new Object();

  self.renderFromTemplate = (templateId, root = null) => {
    const template = document.querySelector(templateId);
    const templateCopy = document.importNode(template.content, true);
    if (root) {
      root.innerHTML = '';
      root.appendChild(templateCopy);
    }
    return templateCopy
  }

  return self;
}

/* Represents a Map
 * @param layers - The layers array to render
 * @param id - The Mapbox ID to print the tiles
 */
const Map = function(layers, id) {
  let map;
  let baseLayer;

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
    map.eachLayer((layer) => layer !== baseLayer ? map.removeLayer(layer) : '');
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
    map = L.map(domID).setView([5,0], 2);
    baseLayer = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        id: id,
        accessToken: MAPBOX_ACCESS_TOKEN
        }).addTo(map);
  };

  self.prepareFeature = (latlng, layer) => {
    const style = layer.getStyles();
    if (style.color) {
      const options = Object.assign({
        radius: 8,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      }, layer.getStyles());
      return L.circleMarker(latlng, options);
    } else {
      return L.marker(latlng, { icon: self.icons()[style.image] });
    }
  }

  self.addLayer = (layer) => {
    L.geoJSON(layer.toGeoJSON(), {
      pointToLayer: (feature, latlng) => self.prepareFeature(latlng, layer)
    }).addTo(map);
  };

  return self;
};

/*
 * Represents a layer. Made to be used inside a ListView
 * @param layer - The layer itself
 * @param onClickCallback - Callback to execute on click
 */
const SelectLayerView = (layer, onClickCallback, selected) => {
  const self = new BaseView();
  layer.subscribe(self);

  self.notify = (event, subject) => {
    self.render();
  }

  self.render = () => {
    const $el = self.renderFromTemplate('#list-item');
    const textNode = document.createTextNode(layer.getName());
    const item = $el.querySelector('.js-item');
    item.appendChild(textNode);
    if (selected) {
      item.classList.add('item-list__item--is-selected');
    }
    item.addEventListener('click', () => onClickCallback(layer));
    return $el;
  }

  return self;
}

/*
 * Represents a feature. Made to be used inside a ListView
 * @param feature - The feature itself
 * @param onToggleCallback - Callback to execute on click
 * @param selected - Boolean to know if the element is selected or don't
 */
const SelectFeatureView = function(feature, onToggleCallback, selected) {
  const self = new BaseView();

  self.render = () => {
    const $el = self.renderFromTemplate('#list-item');
    const textNode = document.createTextNode(feature.getName());
    const item = $el.querySelector('.js-item');
    item.appendChild(textNode);
    if (selected) {
      item.classList.add('item-list__item--is-selected');
    }
    item.addEventListener('click', () => onToggleCallback(item, feature));
    return $el;
  }

  return self;
}

/*
 * Represents a component that list elements
 * @params items - The items to list
 * @params domId - the DOM element's ID where the component should be rendered
 * @params itemBuilder - A function that creates each item
 */
const ListView = function(items, domId, itemBuilder) {
  const self = new Object();
  items.subscribe && items.subscribe(self);

  self.notify = (event, subject) => self.render();

  self.render = () => {
    // TODO
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

/*
 * Represents a component to pick an option from a list of options
 * @param layer - The layer being modified
 * @param $el - The DOM element where the component should be rendered
 * @param style - The name of the style being modified
 * @param options - The list of values the style can have
 * @param optionBuilder - Function that creates each concrete option
 */
const PickerView = function(layer, $el, style, options, optionBuilder) {
  const self = new BaseView();
  const isSelectedClass = '--is-selected';

  self.onClick = (selectedValue, event) => {
    const nodes = $el.querySelectorAll('.js-option');
    [].forEach.call(nodes, (selectedValue) => selectedValue.classList.remove(isSelectedClass));
    event.target.classList.add(isSelectedClass);
    layer.setStyle(style, selectedValue);
  }

  self.render = () => {
    self.renderFromTemplate('#color-picker', $el);
    const $root = document.querySelector('.js-color-picker');

    const colorOptions = options.map((color) => {
      const option = optionBuilder(layer, color);
      if (color === layer.getStyles()[style]) {

        option.classList.add(isSelectedClass);
      }
      $root.appendChild(option);
      option.addEventListener('click', (event) => self.onClick(color, event));
    });
  }

  return self;
}

/*
 * Represents a component to select a number inside a range
 * @param layer - The layer being modified
 * @param $el - The DOM element where the component should be rendered
 * @param style - The name of the style being modified
 * @param maxSize - Upper limit for the value selected
 * @param step - Value for the step attribute @ HTML. 1 by default
 */
NumberSelectorView = function(layer, $el, style, maxSize, step = 1) {
  const self = new BaseView();

  self.render = () => {
    self.renderFromTemplate('#number-selector', $el);

    const $input = $el.querySelector('.js-input-number');
    $input.setAttribute('max',   maxSize);
    $input.setAttribute('value', layer.getStyles()[style]);
    $input.setAttribute('step',  step);

    $input.addEventListener('input', () => {
      layer.setStyle(style, $input.value);
    });

  }
  return self;
}

/*
 * Represents the complete group of properties that a layer can modify
 * @param layers - All the layers
 * @param domId - The element's id where the component should be rendered
 */
const PropertiesView = function(layers, domId) {
  const self = new BaseView();
  let layer;
  layers.subscribe(self);

  self.changeLayer = (newLayer) => {
    layer = newLayer;
    self.render();
  }

  self.notify = (event, layer) => {
    if (event === 'layer.renamed') {
      self.updateTitle();
    }
  }

  /*
   * Updates the title with the layer's name
   */
  self.updateTitle = () => document.querySelector("#layer-on-properties").innerHTML = layer.getName();

  self.renderProperties = (layer) => {
    const $select = document.querySelector('.js-select');
    layer.setPreferredStyle($select.value);
    if ($select.value === 'image') {
      ImagePropertiesView(layer, document.querySelector('.js-properties-marker')).render();
    } else {
      CirclePropertiesView(layer, document.querySelector('.js-properties-marker')).render();
    }
  }

  self.render = () => {
    const $el = document.getElementById(domId);
    self.renderFromTemplate('#properties-template', $el);

    const $nameInput = $el.querySelector('.js-name');
    $nameInput.setAttribute('value', layer.getName());
    $nameInput.addEventListener('keyup', () => layer.setName($nameInput.value));

    CirclePropertiesView(layer, $el.querySelector('.js-properties-marker')).render();

    const $select = document.querySelector('.js-select');
    $select.value = layer.getPreferredStyle();
    $select.addEventListener('change', () => self.renderProperties(layer));

    self.updateTitle();
    self.renderProperties(layer);
  }
  return self;
}

/*
 * Represents a component where all the icon marker's properties can be modified
 * @params layer - The layer to modify
 * @param $el - The DOM element where it should be rendered
 */
ImagePropertiesView = function(layer, $el) {
  const self = new BaseView();

  /* Method to build each image to render inside the Picker element */
  const ImageToPickBuilder = (layer, color, style) => {
    const colorTemplate = document.querySelector('#image-picker-option');
    const colorOptionCopy = document.importNode(colorTemplate.content, true);
    const option = colorOptionCopy.querySelector('.js-option');
    option.setAttribute('src', color);
    return option;
  }

  self.render = () => {
    self.renderFromTemplate('#image-marker', $el);

    PickerView(layer, document.querySelector('.js-image-picker'), 'image', IMAGES, ImageToPickBuilder).render();
  }

  return self;
}

/*
 * Represents a component where all the circle marker's properties can be modified
 * @params layer - The layer to modify
 * @param $el - The DOM element where it should be rendered
 */
CirclePropertiesView = function(layer, $el) {
  const self = new BaseView();

  /* Function to build each color to render inside the Picker element */
  const ColorToPickBuilder = (layer, color, style) => {
    const colorTemplate = document.querySelector('#color-picker-option');
    const colorOptionCopy = document.importNode(colorTemplate.content, true);
    const option = colorOptionCopy.querySelector('.js-option');
    option.style.backgroundColor = color;
    return option;
  }

  self.render = () => {
    if (!layer) {
      return;
    }

    self.renderFromTemplate('#circle-marker', $el);

    PickerView(layer, document.querySelector('.js-stroke-color-picker'), 'color', COLORS, ColorToPickBuilder).render();
    PickerView(layer, document.querySelector('.js-fill-color-picker'), 'fillColor', COLORS, ColorToPickBuilder).render();
    NumberSelectorView(layer, document.querySelector('.js-radius'), 'radius', 50).render();
    NumberSelectorView(layer, document.querySelector('.js-weight'), 'weight', 20).render();
    NumberSelectorView(layer, document.querySelector('.js-stroke-opacity'), 'opacity', 1, 0.1).render();
    NumberSelectorView(layer, document.querySelector('.js-fill-opacity'), 'fillOpacity', 1, 0.1).render();

  }
  return self;
}

/*
 * Represents a Sidebar where layers can be modified by a PropertyView
 * @param layers - The list of layers
 * @param $el - The DOM element where the sidebar should be rendered
 * @param features - The complete list of features that can be used
 */
const MainSidebar = function(layers, $el, features) {
  const self = new BaseView();

  self.render = () => {
    const root = self.renderFromTemplate('#main-sidebar', $el);

    const $addLayer = document.querySelector('.js-add-layer');
    $addLayer.addEventListener('click', () => AddLayer(layers, $el, features).render());

    const properties = PropertiesView(layers, 'properties');
    const propertiesLayer = layers.getLayer(layers.length() - 1);
    properties.changeLayer(propertiesLayer);
    const onLayerClick = (layer) => properties.changeLayer(layer);
    const layerViewBuilder = (layer) => SelectLayerView(layer, onLayerClick, true);
    ListView(layers, 'layers', layerViewBuilder).render();
  }

  return self;
}

/*
 * Represents a sidebar component where a new layer can be created
 * @param layers - The list of layers
 * @param $el - The DOM element where the sidebar should be rendered
 * @param features - The complete list of features that can be used
 */
AddLayer = function(layers, $el, features) {
  const self = new BaseView();
  const selectedClass = 'item-list__item--is-selected';
  let selectedFeatures = [];

  self.onToggleCallback = ($el, selectedFeature) => {
    if ($el.classList.contains(selectedClass)) {
      const indexToRemove = selectedFeatures.indexOf(selectedFeature);
      selectedFeatures.splice(indexToRemove, 1);
      $el.classList.remove(selectedClass);
    } else {
      $el.classList.add(selectedClass);
      selectedFeatures.push(selectedFeature);
    }

    const selectFeatureViewBuilder = (feature) => SelectFeatureView(
      feature,
      (...args) => self.onToggleCallback(...args),
      true
    );
    ListView(selectedFeatures, 'new-layer', selectFeatureViewBuilder).render();
  };

  self.installCancelButton = () => {
    const $cancel = document.querySelector('.js-cancel');
    $cancel.addEventListener('click', () => MainSidebar(layers, $el, features).render());
  }

  self.installSaveButton = () => {
    const $save = document.querySelector('.js-save');
    $save.addEventListener('click', () => {
      layers.add(Layer(selectedFeatures));
      MainSidebar(layers, $el, features).render();
    });
  }

  self.renderFeatures = () => {
    const selectFeatureViewBuilder = (feature) => SelectFeatureView(feature, (...args) => self.onToggleCallback(...args));
    ListView(features, 'features', selectFeatureViewBuilder).render();
  }

  self.render = () => {
    self.renderFromTemplate('#add-layer', $el);

    self.renderFeatures();

    self.installCancelButton();
    self.installSaveButton();

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
