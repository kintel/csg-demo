function CSGScene() {
  this.products = []; // Array of CSGProduct objects
}

CSGScene.prototype = {
  constructor: CSGScene,
  load: function(url, callback) {
    console.log('loading ' + url + '...');
    var loader = new THREE.SceneLoader();
    loader.load(url, this.loaderFinished.bind(this, callback));
  },
  loaderFinished: function(callback, result) {
    console.log('loaderFinished');
    var scene = result.scene;
    var self = this;
    scene.children.forEach(function(ch) {
      if (ch.userData.type === 'transparents') {
        self.transparents = ch.children;
        return;
      }
      var intesections, differences;
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
