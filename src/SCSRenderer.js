function SCSRenderer(renderer, scene, lights) {
  var self = this;
  this.renderer = renderer;
  this.scene = scene;
  this.products = [];
  this.transparent_objects = new THREE.Scene();
  lights.forEach(function(light) {
    self.transparent_objects.add(light.clone());
  });

  var transparents;
  this.numProducts = 0;
  scene.children.forEach(function(ch) {
    if (ch.userData.type === 'transparents') {
      transparents = ch;
      return;
    }
    var product = ch;
    var intersections, differences;
    product.children.forEach(function(child) {
      if (child.userData) {
	if (child.userData.type === 'intersections') {
	  intersections = child;
	}
	else if (child.userData.type === 'differences') {
	  differences = child;
	}
      }
    });
    if (intersections) {
      product.intersections = new THREE.Scene();
      product.intersections.add(intersections);
      lights.forEach(function(light) {
	product.intersections.add(light.clone());
      });
      product.intersections.numObjects = intersections.children.length;
    }
    if (differences) {
      product.differences = new THREE.Scene();
      product.differences.objects = differences.children;
      product.differences.add(differences);
      lights.forEach(function(light) {
	product.differences.add(light.clone());
      });
    }
    self.products.push(product);
    self.numProducts++;
  });

  if (transparents) self.transparent_objects.add(transparents);


  var scsPassShader = {
    uniforms: {},
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
vec4 mvPosition;\n\
mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
varying vec4 pos;\n\
float calcDepth(vec4 pos) {\n\
return pos.z/pos.w;\n\
}\n\
void main() {\n\
//      gl_FragColor = vec3(0.0, 0.2, 0.0);\n\
//      gl_FragColor = vec4(0.0, 0.2, 0.0, gl_FragCoord.z); // Copy depth to .a\n\
gl_FragColor = vec4(0.0, 0.0, 0.0, calcDepth(pos)); // Copy calculated depth to .a\n\
}\n'
  };

	/*
	 How gl_FragCoord.z is calculated:
	 
	 float far=gl_DepthRange.far; float near=gl_DepthRange.near;
	 
	 vec4 eye_space_pos = gl_ModelViewMatrix * something
	vec4 clip_space_pos = gl_ProjectionMatrix * eye_space_pos;
	
	float ndc_depth = clip_space_pos.z / clip_space_pos.w;
	
	float depth = (((far-near) * ndc_depth) + near + far) / 2.0;
	gl_FragDepth = depth;
	*/

  var mergeObjectsShader = {
    uniforms: {
      merged: {type: 't'},
      viewSize: {type: '2f'}
    },
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
vec4 mvPosition;\n\
mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
uniform sampler2D merged;\n\
uniform vec2 viewSize;\n\
varying vec4 pos;\n\
float calcDepth(vec4 pos) {\n\
return pos.z/pos.w;\n\
}\n\
		void main() {\n\
vec2 coord = gl_FragCoord.xy / viewSize;\n\
vec4 texval = texture2D(merged, coord);\n\
//      if (gl_FragCoord.z == texval.a) {\n\
if (calcDepth(pos) == texval.a) {\n\
//      if (abs(calcDepth(pos) - texval.a) < 0.0001) {\n\
//      if (calcDepth(pos) <= texval.a) {\n\
gl_FragColor = vec4(texval.rgb, 1);\n\
}\n\
else discard;\n\
}\n'
  };

  var clipshader = {
    uniforms: {},
    vertexShader: '\
void main() {\n\
gl_Position = vec4(position.xyz, 1);\n\
}\n',
    fragmentShader: '\
void main() {\n\
gl_FragColor = vec4(0.0, 0.2, 0.0, 1.0);\n\
}\n'
  };

  var mergeshader = {
    uniforms: {
      src: {type: 't'},
      srcdepth: {type: 't'},
      prev: {type: 't'}
    },
    vertexShader: '\n\
varying vec2 coord;\n\
void main() {\n\
  coord = uv.xy;\n\
  gl_Position = vec4(position.xy, 0, 1);\n\
}\n',
    fragmentShader: '\n\
uniform sampler2D src;\n\
uniform sampler2D srcdepth;\n\
uniform sampler2D prev;\n\
varying vec2 coord;\n\
void main() {\n\
  vec4 srcfrag = texture2D(src, coord);\n\
  vec4 prevfrag = texture2D(prev, coord);\n\
  // float srcd = texture2D(srcdepth, coord).r;\n\
  float srcd = srcfrag.a;\n\
  // gl_FragColor = (srcd <= prevfrag.a) ? vec4(srcfrag.rgb, srcd) : prevfrag;\n\
  gl_FragColor = (srcd - 0.000001) < prevfrag.a ? vec4(srcfrag.rgb, srcd) : prevfrag;\n\
}\n'
	};

  this.scsPassMaterial = new THREE.ShaderMaterial( {
    blending: THREE.NoBlending,
    uniforms: scsPassShader.uniforms,
    vertexShader: scsPassShader.vertexShader,
    fragmentShader: scsPassShader.fragmentShader
  } );
  
  this.mergeObjectsMaterial = new THREE.ShaderMaterial( {
    uniforms: mergeObjectsShader.uniforms,
    vertexShader: mergeObjectsShader.vertexShader,
    fragmentShader: mergeObjectsShader.fragmentShader
  } );
  
  this.clipScene = createQuadScene(clipshader);
  this.mergeScene = createQuadScene(mergeshader);
  this.quadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
  
  // Setup two temporary RGBA float textures for accumulating product depths and color buffers
  var viewport = gl.getParameter(gl.VIEWPORT);
  this.desttextures = [];
  for (var i=0;i<2;i++) {
    this.desttextures[i] = new THREE.WebGLRenderTarget(viewport[2], viewport[3], {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false
    });
  }
  this.depthTexture = new THREE.DepthTexture(viewport[2], viewport[3], true);
  
  this.csgTexture = new THREE.WebGLRenderTarget(viewport[2], viewport[3], {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthTexture: this.depthTexture});
}

/*!
  Renders the intersections of a product into the depth buffer of the given renderTarget.
  The renderTarget needs to be a float texture.
  The result is a depth buffer, as well as a "synthetic" depth buffer encoded into
  the alpha channel of the renderTarget.
*/
SCSRenderer.prototype.renderConvexIntersections = function (product, camera, renderTarget) {
  product.intersections.overrideMaterial = this.scsPassMaterial;
  //	
  // a) Draw the furthest front facing surface into z-buffer.
  //
  gl.colorMask(false,false,false,true);
  gl.depthFunc(gl.GREATER);
  gl.clearDepth(0.0);
  this.renderer.clearTarget(renderTarget, true, true, true);
  this.renderer.render(product.intersections, camera, renderTarget);
  gl.clearDepth(1.0);
  
  //	
  // b) Count the number of back-facing surfaces behind each pixel.
  // 
  // Count in stencil buffer, don't draw to depth or color buffers
  gl.depthMask(false);
  gl.colorMask(false,false,false,false);
  gl.cullFace(gl.FRONT);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.ALWAYS,0,-1);
  gl.stencilOp(gl.KEEP,gl.KEEP,gl.INCR);
  
  renderer.render(product.intersections, camera, renderTarget);
  gl.cullFace(gl.BACK);
  
  //
  // c) Reset the z-buffer for pixels where stencil != n
  // FIXME: Also, reset stencil to zero
  // 
  gl.depthMask(true);
  gl.colorMask(false,false,false,true);
  gl.depthFunc(gl.ALWAYS);
  gl.stencilFunc(gl.NOTEQUAL,product.intersections.numObjects,-1);
  gl.stencilOp(gl.KEEP,gl.KEEP,gl.KEEP);
  renderer.render(this.clipScene, this.quadCamera, renderTarget);
  
  gl.disable(gl.STENCIL_TEST);
  gl.colorMask(true, true, true, true);
  gl.depthFunc(gl.LEQUAL);
  delete product.intersections.overrideMaterial;
}

SCSRenderer.prototype.renderSceneToFramebuffer = function(scene, camera, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  // FIXME: manage viewport properly somewhere else
  var v = gl.getParameter(gl.VIEWPORT);
  size = size || [256,0];
  setupWindowViewport(pos, size);
  var newv = gl.getParameter(gl.VIEWPORT);
  this.renderer.render(scene, camera);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

SCSRenderer.prototype.renderSceneDepthToTexture = function (scene, renderTarget, camera) {
  scene.overrideMaterial = this.scsPassMaterial;

  gl.colorMask(false,false,false,true);
  // We need to clear alpha to 1 for synthetic Z buffer
  // This is not necessary when we render multiple intersections since we 
  // manually reset the unused z buffer to 1 in that case
  gl.clearColor(0,0,0,1);
  this.renderer.clearTarget(renderTarget, true, true, true);
  this.renderer.render(scene, camera, renderTarget);
  gl.clearColor(0,0,0,0);

  gl.colorMask(true, true, true, true);
  delete scene.overrideMaterial;
}

/*
  Renders the subtractions of a procuct into the renderTarget.
  The rendertarget is assumed to have an attached depth buffer containing
  the intersections of the product.
  The result is still a depth buffer as well as a "synthetic" depth buffer encoded
  into the alpha channel of the renderTarget
*/
SCSRenderer.prototype.renderConvexSubtractions = function (product, camera, renderTarget)
{
  product.differences.overrideMaterial = this.scsPassMaterial;
  
  renderer.clearTarget(renderTarget, false, false, true);
  
  gl.colorMask(false,false,false,true);
  
  renderer.setRenderTarget(renderTarget); // To get correct stencil bits
  var stencilBits = gl.getParameter(gl.STENCIL_BITS);
  var stencilMask = (1 << stencilBits) - 1;
  var stencilCode = 0;
  
  console.log("renderConvexSubtractions: " + stencilBits + " stencil bits");
  
  // a) Mark all front facing fragments - this is where negative parts can show through
  gl.enable(gl.STENCIL_TEST);
  
  product.differences.objects.forEach(function(obj) { obj.visible = false; });
  
  // This creates a worst-case (N^2) subtraction sequence
  // Optimizations:
  // o Batch primitives which don't overlap in screen-space
  for (var j=0;j<product.differences.objects.length;j++) 
    for (var i=0;i<product.differences.objects.length;i++) {
      product.differences.objects[i].visible = true;
      
      stencilCode++;
      
      gl.depthMask(false);
      gl.colorMask(false,false,false,false);
      gl.stencilFunc(gl.ALWAYS, stencilCode, -1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      renderer.render(product.differences, camera, renderTarget);
      
      // b) Render back faces clipped against marked area
      gl.cullFace(gl.FRONT);
      gl.depthFunc(gl.GEQUAL);
      gl.depthMask(true);
      gl.colorMask(false,false,false,true);
      gl.stencilFunc(gl.EQUAL, stencilCode, -1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      renderer.render(product.differences, camera, renderTarget);
      
      gl.depthFunc(gl.LEQUAL);
      gl.cullFace(gl.BACK);
      
      product.differences.objects[i].visible = false;
    }
  product.differences.objects.forEach(function(obj) { obj.visible = true; });
  
  gl.disable(gl.STENCIL_TEST);
  gl.colorMask(true, true, true, true);
  delete product.differences.overrideMaterial;
};


/*!
  Cuts out areas where subtracted parts of the product caused transparent ares.
  The result is still a depth buffer as well as a "synthetic" depth buffer encoded
  into the alpha channel of the renderTarget
*/
SCSRenderer.prototype.renderClipZBuffer = function (product, camera, renderTarget)
{
  // FIXME: Do we need to render this when we have no subtractions?

  product.intersections.overrideMaterial = this.scsPassMaterial;
  
  //
  // a) Mark areas where we can see the backfaces
  // 
  gl.colorMask(false,false,false,false);
  gl.depthMask(false);
  gl.cullFace(gl.FRONT);
  gl.depthFunc(gl.LESS);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.ALWAYS,1,-1);
  gl.stencilOp(gl.KEEP,gl.KEEP,gl.REPLACE);
  
  renderer.clearTarget(renderTarget, false, false, true);
  // Draw all intersected objects
  renderer.render(product.intersections, camera, renderTarget);
  
  // 
  // b) Reset see-through pixels
  // 
  gl.depthMask(true);
  gl.colorMask(false,false,false,true);
  gl.depthFunc(gl.ALWAYS);
  gl.cullFace(gl.BACK);
  gl.stencilFunc(gl.EQUAL,1,-1);
  gl.stencilOp(gl.KEEP,gl.KEEP,gl.KEEP);
  renderer.render(this.clipScene, this.quadCamera, renderTarget);
  
  gl.disable(gl.STENCIL_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.colorMask(true,true,true,true);
  delete product.intersections.overrideMaterial;
}

/*!
 Use the current z buffer for depth equality test of incoming fragments.
 The z buffer should represent a merged depth buffer.

 Uses real shader materials, but masks away the alpha channel as we're using it 
 to store our synthetic depth buffer.

 The result is a correct color channel for the product. The depth
 buffer and synthetic depth buffer stays unchanged.
*/
SCSRenderer.prototype.renderLightingUsingZBuffer = function(product, camera, renderTarget) {
  gl.depthFunc(gl.EQUAL);
  gl.colorMask(true,true,true,false);
  renderer.render(product.intersections, camera, renderTarget);
  if (product.differences) {
    gl.cullFace(gl.FRONT);
    renderer.render(product.differences, camera, renderTarget);
  }
  gl.cullFace(gl.BACK);
  gl.colorMask(true,true,true,true);
  gl.depthFunc(gl.LEQUAL);
}

/*!
  Merges a renderTarget and a previously merged buffer into a destination buffer.

  renderTarget: float RGBA + depth attachment (A is synthetic depth)
  prev/dest: float RGBA (A is synthetic depth)

  Since we use the alpha channel as a synthetic depth buffer, we need
  float textures for all buffers.
*/
SCSRenderer.prototype.mergeBuffers = function(src, prev, dest) {
  
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  this.mergeScene.shaderMaterial.uniforms.src.value = src;
  this.mergeScene.shaderMaterial.uniforms.srcdepth.value = src.depthTexture;
  this.mergeScene.shaderMaterial.uniforms.prev.value = prev;
  this.renderer.render(this.mergeScene, this.quadCamera, dest);
  gl.enable(gl.DEPTH_TEST);
}

/*!
  Takes a merged color buffer with a synthetic depth buffer encoded
  into the alpha channel and renders into the framebuffer, providing actual Z
  values from all products.

  This is necessary to enable rendering of other primitives into the
  scene later on.
*/
SCSRenderer.prototype.mergeObjectsWithTexture = function(texture, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var v = gl.getParameter(gl.VIEWPORT);
  size = size || [256,0];
  setupWindowViewport(pos, size);
  var newv = gl.getParameter(gl.VIEWPORT);
  
  gl.depthFunc(gl.ALWAYS);
  this.mergeObjectsMaterial.uniforms.merged.value = texture;
  this.mergeObjectsMaterial.uniforms.viewSize.value = [newv[2], newv[3]];
  for (var i=0;i<this.numProducts;i++) {
    var product = this.products[i];
    product.intersections.overrideMaterial = this.mergeObjectsMaterial;
    renderer.render(product.intersections, camera);
    if (product.differences) {
      gl.cullFace(gl.FRONT);
      product.differences.overrideMaterial = this.mergeObjectsMaterial;
      renderer.render(product.differences, camera);
      delete product.differences.overrideMaterial;
    }
    gl.cullFace(gl.BACK);
    delete product.intersections.overrideMaterial;
  }
  gl.depthFunc(gl.LESS);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

SCSRenderer.prototype.mergeProductWithTexture = function(product, texture, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var v = gl.getParameter(gl.VIEWPORT);
  size = size || [256,0];
  setupWindowViewport(pos, size);
  var newv = gl.getParameter(gl.VIEWPORT);
  
  this.mergeObjectsMaterial.uniforms.merged.value = texture;
  this.mergeObjectsMaterial.uniforms.viewSize.value = [newv[2], newv[3]];
  product.intersections.overrideMaterial = this.mergeObjectsMaterial;
  renderer.render(product.intersections, camera);
  if (product.differences) {
    gl.cullFace(gl.FRONT);
    product.differences.overrideMaterial = this.mergeObjectsMaterial;
    renderer.render(product.differences, camera);
    delete product.differences.overrideMaterial;
  }
  gl.cullFace(gl.BACK);
  delete product.intersections.overrideMaterial;
  gl.viewport(v[0], v[1], v[2], v[3]);
}

SCSRenderer.prototype.render = function(camera, options) 
{
  if (options.realZBuffer) {
    this.renderWithRealZBuffer(camera, options);
  }
  else {
    console.log("No matching rendering algorithm found");
  }
}

SCSRenderer.prototype.renderWithRealZBuffer = function(camera, options) 
{
  if (options.optimizeMerges) {
    this.renderWithOptimizeMerges(camera);
  }
  else {
    this.renderWithRealZBufferClassic(camera);
  }
}

SCSRenderer.prototype.renderProductToTexture = function(product, texture, camera) 
{
  if (product.intersections.numObjects > 1) {
    this.renderConvexIntersections(product, camera, texture);
  }
  else {
    // Optimization: Just render the object depth without clipping or stencils
    this.renderSceneDepthToTexture(product.intersections, texture, camera);
  }
  if (product.differences) { // Skip if we only have positives
    this.renderConvexSubtractions(product, camera, texture);
    this.renderClipZBuffer(product, camera, texture);
  }
  this.renderLightingUsingZBuffer(product, camera, texture);
}

SCSRenderer.prototype.renderWithOptimizeMerges = function(camera, options) 
{
  // FIXME: Only if necessary
  for (var i=0;i<2;i++) {
    // Init alpha with 1 since we're using alpha to emulate a depth buffer
    gl.clearColor(0,0,0,1);
    renderer.clearTarget(this.desttextures[0]);
    gl.clearColor(0,0,0,0);
  }
  
  this.renderer.clearTarget(this.csgTexture, true, false, false);
  for (var i=0;i<this.numProducts;i++) {
    var product = this.products[i]
    if (!product.differences && product.intersections.numObjects === 1) {
      this.renderSceneToFramebuffer(product.intersections, camera, [0,0], [window.innerWidth, window.innerHeight]);
    }
    else {
      this.renderProductToTexture(product, this.csgTexture, camera)
      this.mergeProductWithTexture(product, this.csgTexture, [0,0], [window.innerWidth, window.innerHeight]);
    }
  }
}

SCSRenderer.prototype.renderWithRealZBufferClassic = function(camera, options) 
{
  // FIXME: Only if necessary
  for (var i=0;i<2;i++) {
    // Init alpha with 1 since we're using alpha to emulate a depth buffer
    gl.clearColor(0,0,0,1);
    renderer.clearTarget(this.desttextures[0]);
    gl.clearColor(0,0,0,0);
  }
  
  this.renderer.clearTarget(this.csgTexture, true, false, false);
  for (var i=0;i<this.numProducts;i++) {
    var product = this.products[i];
    this.renderProductToTexture(product, this.csgTexture, camera)
    this.mergeBuffers(this.csgTexture, this.desttextures[i%2], this.desttextures[(i+1)%2]);
  }
  
  var currdesttexture = this.numProducts%2;
  //	this.renderer.clearTarget(this.csgTexture, true, true, true);
  
  //  showRGBTexture(this.desttextures[1], [0,0], [window.innerWidth, window.innerHeight]);
  if (settings.debug) {
    showRGBTexture(this.desttextures[currdesttexture], [-256,-256*window.innerHeight/window.innerWidth]);
    showRGBTexture(this.desttextures[(currdesttexture+1)%2], [-256,-512*window.innerHeight/window.innerWidth]);
    showRGBTexture(scsRenderer.csgTexture, [-256,-768*window.innerHeight/window.innerWidth]);
    showAlpha(this.desttextures[currdesttexture], [-500,-256*window.innerHeight/window.innerWidth]);
    showAlpha(this.desttextures[(currdesttexture+1)%2], [-500,-512*window.innerHeight/window.innerWidth]);
    showAlpha(this.desttextures[scsRenderer.csgTexture], [-500,-768*window.innerHeight/window.innerWidth]);
  }
  
  this.mergeObjectsWithTexture(this.desttextures[currdesttexture], [0,0], [window.innerWidth, window.innerHeight]);
};
