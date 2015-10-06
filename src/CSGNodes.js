function CSGScene() {
  this.products = []; // Array of CSGProduct objects
}

CSGScene.prototype = {
  constructor: CSGScene,
  load: function(url, callback) {
    console.log('loading ' + url + '...');
    var loader = new THREE.ObjectLoader();
    loader.load(url, this.loaderFinished.bind(this, callback));
  },
  loaderFinished: function(callback, result) {
    console.log('loaderFinished');
    var root = result;
    var self = this;
    root.children.forEach(function(ch) { // Loop over top-level objects (products)
// FIXME: Reinstate transparents
//      if (ch.userData.type === 'transparents') {
//        self.transparents = ch.children;
//        return;
//      }
      var intersections, differences;
      ch.children.forEach(function(child) {
        if (child.userData) {
	  if (child.userData.type === 'intersections') {
	    intersections = child.children;
	  }
	  else if (child.userData.type === 'differences') {
	    differences = child.children;
	  }
        }
      });
      var product = new CSGProduct(intersections, differences);
      self.products.push(product);
    });
    console.log('callback');
    callback();
  },
  toJSON: function() {
    var root = new THREE.Group;
    this.products.forEach(function(product) {
      var prodgroup = new THREE.Group;
      var intgroup = new THREE.Group;
      intgroup.userData.type = 'intersections';
      product.intersections.forEach(function(intersection) {
        intgroup.children.push(intersection);
      });
      prodgroup.children.push(intgroup);
      if (product.differences) {
        var diffgroup = new THREE.Group;
        diffgroup.userData.type = 'differences';
        product.differences.forEach(function(difference) {
          diffgroup.children.push(difference);
        });
        prodgroup.children.push(diffgroup);
      }
      root.children.push(prodgroup);
    });
    root.updateMatrixWorld();
    var json = root.toJSON();
    return JSON.stringify(json);
  }
};

function CSGProduct(intersections, differences) {
  this.intersections = intersections; // Array of Object3D
  this.differences = differences; // Array of Object3D
}

CSGProduct.prototype = {
  constructor: CSGProduct
};

exports.CSGScene = CSGScene;
exports.CSGProduct = CSGProduct;
