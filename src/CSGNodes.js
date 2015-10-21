/*
  A three.js-representation of a normalized CSG tree

  Classes:
  CSGScene     - a list of CSGProducts
  CSGProduct   - a list of intersections and a list of subtractions (THREE.Object3D instances)
  
*/

function CSGScene() {
  this.products = []; // Array of CSGProduct objects
  this.raycaster = new THREE.Raycaster();
  this.pickingscene = new THREE.Group();
  this.pickingscene.csgscene = this;
  this.nodemap = {};
}

// For picking:
// Group (pickingscene)
//   + - Group (prodgroup)
//   |     + - Group (intgroup)
//   |     |     + - children (intersections)
//   |     + - Group (diffgroup)
//   |           + - children (differences)
// [...]
CSGScene.prototype = {
  constructor: CSGScene,
  add: function(product) {
    this.products.push(product);
    var prodgroup = product.createPickingGroup();
    this.pickingscene.add(prodgroup);
  },
  load: function(url, callback) {
    console.log('loading ' + url + '...');
    this.nodemap = {};
    this.pickingscene = new THREE.Group();
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
      // Since we don't have the CSG tree available, create placeholder
      // objects for the missing CSGLeaf.
      function registerMesh(mesh) {
        var csgleafkey = mesh.userData.csgleaf || mesh.name || THREE.Math.generateUUID();
        var csgleaf = self.nodemap[csgleafkey];
        if (csgleaf === undefined) {
          csgleaf = self.nodemap[csgleafkey] = {
            meshes: []
          };
        }
        csgleaf.meshes.push(mesh);
        mesh.csgleaf = csgleaf;
      }
      intersections.forEach(registerMesh);
      if (differences) differences.forEach(registerMesh);
      var product = new CSGProduct(intersections, differences);
      self.add(product);
    });
    console.log('callback');
    callback();
  },
  pick: function(mouse, camera) {
    this.raycaster.setFromCamera(mouse, camera);
    var intersects = this.raycaster.intersectObject(this.pickingscene, true);
    console.log("intersects: " + intersects.length);
    console.log(this.pickingscene);
    // Reset all product.insidecount
    for (var i = 0; i < this.products.length; i++) {
      this.products[i].insidecount = 0;
    }
    // Walk intersections front-to-back until first solid surface is found
    var intersect_str = ""
    for (var i = 0; i < intersects.length; i++) {
      var intersection = intersects[i];
      var obj = intersection.object;
      var product = obj.parent.parent.product;
      // intersections are in local coordinates
      var normalMatrix = new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
      var worldNormal = intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      var frontface = this.raycaster.ray.direction.dot(worldNormal) < 0;
      var negative = obj.parent.differences === true;
      var reverse = frontface ? 1 : -1;
      product.insidecount = product.insidecount + reverse * (negative ? -1 : 1);
      if (i > 0) intersect_str += "->";
      if (!frontface) intersect_str += "/";
      var name = (obj.name || obj.geometry.type);
      intersect_str += name;
      if (product.insidecount == product.numIntersections) {
        // Found picked Object3D: obj
        console.log("Found: " + name);
        console.log(intersect_str);
        return obj.original;
      }
    }
    console.log(intersect_str);
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
    return JSON.stringify(json, null, 2);
  }
};

function CSGProduct(intersections, differences) {
  this.numIntersections = intersections.length;
  this.intersections = intersections; // Array of Object3D
  this.differences = differences; // Array of Object3D
}

function createPickingMesh(mesh) {
  var pickmesh = mesh.clone()
  pickmesh.material = new THREE.MeshBasicMaterial();
  pickmesh.material.side = THREE.DoubleSide;
  pickmesh.updateMatrixWorld(true);
  pickmesh.original = mesh;
  return pickmesh;
}

CSGProduct.prototype = {
  constructor: CSGProduct,
  createPickingGroup: function() {
    var intgroup = new THREE.Group();
    intgroup.intersections = true;
    this.intersections.forEach(function(mesh) { intgroup.add(createPickingMesh(mesh)); });
    var diffgroup = new THREE.Group();
    diffgroup.differences = true;
    if (this.differences) this.differences.forEach(function(mesh) { diffgroup.add(createPickingMesh(mesh)); });
    var prodgroup = new THREE.Group();
    prodgroup.product = this;
    prodgroup.add(intgroup, diffgroup);
    return prodgroup;
  }
};

exports.CSGScene = CSGScene;
exports.CSGProduct = CSGProduct;
