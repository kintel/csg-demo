function SCSRenderer(renderer) {
  var self = this;
  this.renderer = renderer;
  this.gl = renderer.getContext();
  this.size = this.renderer.getSize();
  this.viewport = this.gl.getParameter(this.gl.VIEWPORT);
  this.products = [];
  this.lights = [];

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
  var idColorShader = {
    uniforms: {
      color: {
	type: "c",
	value: new THREE.Color(0.8,1.0,0.8),
	updateFunction: function( uniform, camera, object ){
	  uniform.value.setHex(object.userData.id);
	}
      }
    },
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
  vec4 mvPosition;\n\
  mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
  gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
uniform vec3 color;\n\
void main() {\n\
  gl_FragColor = vec4(color.xyz, 1);\n\
}\n'
  };

  var idMergeShader = {
    uniforms: {
      idtexture: {type: 't'},
      screenSize: {type: '2f'},
      objectID: {
	type: "c",
	value: new THREE.Color(),
	updateFunction: function( uniform, camera, object ){
	  uniform.value.setHex(object.userData.id);
	}
      }
    },
    vertexShader: '\
varying vec4 pos;\n\
void main() {\n\
  vec4 mvPosition;\n\
  mvPosition = modelViewMatrix * vec4( position, 1.0 );\n\
  gl_Position = pos = projectionMatrix * mvPosition;\n\
}\n',
    fragmentShader: '\
uniform vec2 screenSize;\n\
uniform sampler2D idtexture;\n\
uniform vec3 objectID;\n\
void main() {\n\
vec2 ndc = vec2(gl_FragCoord.x/screenSize[0], gl_FragCoord.y/screenSize[1]);\n\
vec4 texval = texture2D(idtexture, ndc);\n\
vec3 tmp = texval.rgb - objectID;\n\
float diff = length(tmp);\n\
if (diff < 0.2) {\n\
//  gl_FragColor = vec4(texval.rgb, 1);\n\
//  gl_FragColor = vec4(tmp, 1);\n\
  gl_FragColor = vec4(objectID, 1);\n\
}\n\
else {\n\
  discard;\n\
}\n\
//gl_FragColor = vec4(objectID.xyz, 1);\n\
}'
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
gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);\n\
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

  this.idMergeMaterial = new THREE.ShaderMaterial( {
    blending: THREE.NoBlending,
    uniforms: idMergeShader.uniforms,
    vertexShader: idMergeShader.vertexShader,
    fragmentShader: idMergeShader.fragmentShader
  } );
  this.idMergeMaterial.hasDynamicUniforms = true;

  this.idColorMaterial = new THREE.ShaderMaterial( {
    blending: THREE.NoBlending,
    uniforms: idColorShader.uniforms,
    vertexShader: idColorShader.vertexShader,
    fragmentShader: idColorShader.fragmentShader
  } );
  this.idColorMaterial.hasDynamicUniforms = true;
  
  this.mergeObjectsMaterial = new THREE.ShaderMaterial( {
    uniforms: mergeObjectsShader.uniforms,
    vertexShader: mergeObjectsShader.vertexShader,
    fragmentShader: mergeObjectsShader.fragmentShader
  } );
  
  this.clipScene = SCSRenderer.createQuadScene(clipshader);
  this.mergeScene = SCSRenderer.createQuadScene(mergeshader);
  this.quadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
  
  this.setupTextureResources();
}

SCSRenderer.prototype = {

    constructor: SCSRenderer,

  // FIXME: Who is responsible for freeing old resources?
  setupTextureResources: function() {
    // Setup two temporary RGBA float textures for accumulating product depths and color buffers
    this.desttextures = [];
    for (var i=0;i<2;i++) {
      this.desttextures[i] = new THREE.WebGLRenderTarget(this.size.width, this.size.height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        depthBuffer: false,
        stencilBuffer: false
      });
    }
    
    var texparams = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    };
    // The depth Texture is currently only used for debugging
    if (false) {
      this.depthTexture = new THREE.DepthTexture(this.size.width, this.size.height, true);
      texparams.depth = this.depthTexture;
    }
    this.csgTexture = new THREE.WebGLRenderTarget(this.size.width, this.size.height, texparams);
  },

/*!
  Renders the intersections of a product into the depth buffer of the given renderTarget.
  The renderTarget needs to be a float texture.
  The result is a depth buffer, as well as a "synthetic" depth buffer encoded into
  the alpha channel of the renderTarget.
*/
  renderConvexIntersections: function (product, camera, renderTarget) {
    product.intersections.overrideMaterial = this.scsPassMaterial;
    //	
    // a) Draw the furthest front facing surface into z-buffer.
    //
    this.gl.colorMask(false,false,false,true);
    this.gl.depthFunc(this.gl.GREATER);
    this.gl.clearDepth(0.0);
    this.renderer.clearTarget(renderTarget, true, true, true);
    this.renderer.render(product.intersections, camera, renderTarget);
    this.gl.clearDepth(1.0);
  
    //	
    // b) Count the number of back-facing surfaces behind each pixel.
    // 
    // Count in stencil buffer, don't draw to depth or color buffers
    this.gl.depthMask(false);
    this.gl.colorMask(false,false,false,false);
    this.gl.cullFace(this.gl.FRONT);
    this.gl.enable(this.gl.STENCIL_TEST);
    this.gl.stencilFunc(this.gl.ALWAYS,0,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.INCR);
    
    this.renderer.render(product.intersections, camera, renderTarget);
    this.gl.cullFace(this.gl.BACK);
    
    //
    // c) Reset the z-buffer for pixels where stencil != n
    // FIXME: Also, reset stencil to zero
    // 
    this.gl.depthMask(true);
    this.gl.colorMask(false,false,false,true);
    this.gl.depthFunc(this.gl.ALWAYS);
    this.gl.stencilFunc(this.gl.NOTEQUAL,product.intersections.numObjects,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
    this.renderer.render(this.clipScene, this.quadCamera, renderTarget);
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.colorMask(true, true, true, true);
    this.gl.depthFunc(this.gl.LEQUAL);
    delete product.intersections.overrideMaterial;
  },

  renderSceneToFramebuffer: function(scene, camera) {
    this.renderer.setRenderTarget(null); // Render to screen
    this.renderer.render(scene, camera);
  },

  renderSceneDepthToTexture: function (scene, renderTarget, camera) {
    scene.overrideMaterial = this.scsPassMaterial;

    this.gl.colorMask(false,false,false,true);
    // We need to clear alpha to 1 for synthetic Z buffer
    // This is not necessary when we render multiple intersections since we 
    // manually reset the unused z buffer to 1 in that case
    this.gl.clearColor(0,0,0,1);
    this.renderer.clearTarget(renderTarget, true, true, true);
    this.renderer.render(scene, camera, renderTarget);
    this.gl.clearColor(0,0,0,0);

    this.gl.colorMask(true, true, true, true);
    delete scene.overrideMaterial;
  },

/*
  Renders the subtractions of a procuct into the renderTarget.
  The rendertarget is assumed to have an attached depth buffer containing
  the intersections of the product.
  The result is still a depth buffer as well as a "synthetic" depth buffer encoded
  into the alpha channel of the renderTarget
*/
  renderConvexSubtractions: function (product, camera, renderTarget)
  {
    product.differences.overrideMaterial = this.scsPassMaterial;
    
    this.renderer.clearTarget(renderTarget, false, false, true);
    
    this.gl.colorMask(false,false,false,true);
    
    this.renderer.setRenderTarget(renderTarget); // To get correct stencil bits
    var stencilBits = this.gl.getParameter(this.gl.STENCIL_BITS);
    var stencilMask = (1 << stencilBits) - 1;
    var stencilCode = 0;
    
//    console.log("renderConvexSubtractions: " + stencilBits + " stencil bits");
    
    // a) Mark all front facing fragments - this is where negative parts can show through
    this.gl.enable(this.gl.STENCIL_TEST);
    
    var difference_objects = product.differences.children[0].children;
    difference_objects.forEach(function(obj) { obj.visible = false; });
    
    // This creates a worst-case (N^2) subtraction sequence
    // Optimizations:
    // o Batch primitives which don't overlap in screen-space
    for (var j=0;j<difference_objects.length;j++) 
      for (var i=0;i<difference_objects.length;i++) {
        difference_objects[i].visible = true;
        
        stencilCode++;
        
        this.gl.depthMask(false);
        this.gl.colorMask(false,false,false,false);
        this.gl.stencilFunc(this.gl.ALWAYS, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.REPLACE);
        this.renderer.render(product.differences, camera, renderTarget);
        
        // b) Render back faces clipped against marked area
        this.gl.cullFace(this.gl.FRONT);
        this.gl.depthFunc(this.gl.GEQUAL);
        this.gl.depthMask(true);
        this.gl.colorMask(false,false,false,true);
        this.gl.stencilFunc(this.gl.EQUAL, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.KEEP);
        this.renderer.render(product.differences, camera, renderTarget);
        
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.cullFace(this.gl.BACK);
        
        difference_objects[i].visible = false;
      }
    difference_objects.forEach(function(obj) { obj.visible = true; });
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.colorMask(true, true, true, true);
    delete product.differences.overrideMaterial;
  },

/*!
  Cuts out areas where subtracted parts of the product caused transparent ares.
  The result is still a depth buffer as well as a "synthetic" depth buffer encoded
  into the alpha channel of the renderTarget
*/
  renderClipZBuffer: function (product, camera, renderTarget)
  {
    // FIXME: Do we need to render this when we have no subtractions?

    product.intersections.overrideMaterial = this.scsPassMaterial;
    
    //
    // a) Mark areas where we can see the backfaces
    // 
    this.gl.colorMask(false,false,false,false);
    this.gl.depthMask(false);
    this.gl.cullFace(this.gl.FRONT);
    this.gl.depthFunc(this.gl.LESS);
    this.gl.enable(this.gl.STENCIL_TEST);
    this.gl.stencilFunc(this.gl.ALWAYS,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.REPLACE);
    
    this.renderer.clearTarget(renderTarget, false, false, true);
    // Draw all intersected objects
    this.renderer.render(product.intersections, camera, renderTarget);
    
    // 
    // b) Reset see-through pixels
    // 
    this.gl.depthMask(true);
    this.gl.colorMask(false,false,false,true);
    this.gl.depthFunc(this.gl.ALWAYS);
    this.gl.cullFace(this.gl.BACK);
    this.gl.stencilFunc(this.gl.EQUAL,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
    this.renderer.render(this.clipScene, this.quadCamera, renderTarget);
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.colorMask(true,true,true,true);
    delete product.intersections.overrideMaterial;
  },

/*!
 Use the current z buffer for depth equality test of incoming fragments.
 The z buffer should represent a merged depth buffer.

 Uses real shader materials, but masks away the alpha channel as we're using it 
 to store our synthetic depth buffer.

 The result is a correct color channel for the product. The depth
 buffer and synthetic depth buffer stays unchanged.
*/
  renderLightingUsingZBuffer: function(product, camera, renderTarget) {
    this.gl.depthFunc(this.gl.EQUAL);
    this.gl.colorMask(true,true,true,false);
    this.renderer.render(product.intersections, camera, renderTarget);
    if (product.differences) {
      this.gl.cullFace(this.gl.FRONT);
      this.renderer.render(product.differences, camera, renderTarget);
    }
    this.gl.cullFace(this.gl.BACK);
    this.gl.colorMask(true,true,true,true);
    this.gl.depthFunc(this.gl.LEQUAL);
  },

/*!
  Merges a renderTarget and a previously merged buffer into a destination buffer.

  renderTarget: float RGBA + depth attachment (A is synthetic depth)
  prev/dest: float RGBA (A is synthetic depth)

  Since we use the alpha channel as a synthetic depth buffer, we need
  float textures for all buffers.
*/
  mergeBuffers: function(src, prev, dest) {
    
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.BLEND);
    this.mergeScene.shaderMaterial.uniforms.src.value = src;
    this.mergeScene.shaderMaterial.uniforms.srcdepth.value = src.depthTexture;
    this.mergeScene.shaderMaterial.uniforms.prev.value = prev;
    this.renderer.render(this.mergeScene, this.quadCamera, dest);
    this.gl.enable(this.gl.DEPTH_TEST);
  },

/*!
  Takes a merged color buffer with a synthetic depth buffer encoded
  into the alpha channel and renders into the framebuffer, providing actual Z
  values from all products.

  This is necessary to enable rendering of other primitives into the
  scene later on.
*/
  mergeObjectsWithTexture: function(camera, texture) {
    this.renderer.setRenderTarget(null); // Render to screen
    
    this.gl.depthFunc(this.gl.ALWAYS);
    this.mergeObjectsMaterial.uniforms.merged.value = texture;
    this.mergeObjectsMaterial.uniforms.viewSize.value = [this.size.width, this.size.height];
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      product.intersections.overrideMaterial = this.mergeObjectsMaterial;
      this.renderer.render(product.intersections, camera);
      if (product.differences) {
        this.gl.cullFace(this.gl.FRONT);
        product.differences.overrideMaterial = this.mergeObjectsMaterial;
        this.renderer.render(product.differences, camera);
        delete product.differences.overrideMaterial;
      }
      this.gl.cullFace(this.gl.BACK);
      delete product.intersections.overrideMaterial;
    }
    this.gl.depthFunc(this.gl.LESS);
  },

  mergeProductWithTexture: function(product, camera, texture) {
    this.renderer.setRenderTarget(null); // Render to screen
    
    this.mergeObjectsMaterial.uniforms.merged.value = texture;
    this.mergeObjectsMaterial.uniforms.viewSize.value = [this.size.width, this.size.height];
    product.intersections.overrideMaterial = this.mergeObjectsMaterial;
    this.renderer.render(product.intersections, camera);
    if (product.differences) {
      this.gl.cullFace(this.gl.FRONT);
      product.differences.overrideMaterial = this.mergeObjectsMaterial;
      this.renderer.render(product.differences, camera);
      delete product.differences.overrideMaterial;
    }
    this.gl.cullFace(this.gl.BACK);
    delete product.intersections.overrideMaterial;
  },

  renderWithRealZBuffer: function(camera, options) 
  {
    if (options.useIDColors) {
      this.renderWithIDColors(camera);
    }
    else if (options.optimizeMerges) {
      this.renderWithOptimizeMerges(camera);
    }
    else {
      this.renderWithRealZBufferClassic(camera);
    }
  },
  
  renderProductToTexture: function(product, texture, camera) 
  {
    if (product.intersections.numObjects > 1) {
      this.renderConvexIntersections(product, camera, texture);
    }
    else {
      // Optimization: Just render the object depth without clipping or stencils
      this.renderSceneDepthToTexture(product.intersections, texture, camera);
    }
    if (product.differences && product.differences.numObjects > 0) { // Skip if we only have positives
      this.renderConvexSubtractions(product, camera, texture);
      this.renderClipZBuffer(product, camera, texture);
    }
    this.renderLightingUsingZBuffer(product, camera, texture);
  },

  renderWithOptimizeMerges: function(camera, options) 
  {
    // FIXME: Only if necessary
    for (var i=0;i<2;i++) {
      // Init alpha with 1 since we're using alpha to emulate a depth buffer
      this.gl.clearColor(0,0,0,1);
      this.renderer.clearTarget(this.desttextures[0]);
      this.gl.clearColor(0,0,0,0);
    }
    
    this.renderer.clearTarget(this.csgTexture, true, false, false);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i]
      if (!product.differences && product.intersections.numObjects === 1) {
        this.renderSceneToFramebuffer(product.intersections, camera);
      }
      else {
        this.renderProductToTexture(product, this.csgTexture, camera)
        this.mergeProductWithTexture(product, camera, this.csgTexture);
      }
    }
  },

  renderWithRealZBufferClassic: function(camera, options) 
  {
    // FIXME: Only if necessary
    for (var i=0;i<2;i++) {
      // Init alpha with 1 since we're using alpha to emulate a depth buffer
      this.gl.clearColor(0,0,0,1);
      this.renderer.clearTarget(this.desttextures[0]);
      this.gl.clearColor(0,0,0,0);
    }
    
    this.renderer.clearTarget(this.csgTexture, true, false, false);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      this.renderProductToTexture(product, this.csgTexture, camera)
      this.mergeBuffers(this.csgTexture, this.desttextures[i%2], this.desttextures[(i+1)%2]);
    }
    
    var currdesttexture = this.products.length%2;
    //	this.renderer.clearTarget(this.csgTexture, true, true, true);
    
    //  showRGBTexture(this.desttextures[1], [0,0], [window.innerWidth, window.innerHeight]);
    if (this.debug) {
//      showRGBTexture(this.desttextures[currdesttexture], [-256,-256*window.innerHeight/window.innerWidth]);
//      showRGBTexture(this.desttextures[(currdesttexture+1)%2], [-256,-512*window.innerHeight/window.innerWidth]);
//      showRGBTexture(scsRenderer.csgTexture, [-256,-768*window.innerHeight/window.innerWidth]);
//      showAlpha(this.desttextures[currdesttexture], [-500,-256*window.innerHeight/window.innerWidth]);
//      showAlpha(this.desttextures[(currdesttexture+1)%2], [-500,-512*window.innerHeight/window.innerWidth]);
//      showAlpha(this.desttextures[scsRenderer.csgTexture], [-500,-768*window.innerHeight/window.innerWidth]);
    }
    
    this.mergeObjectsWithTexture(camera, this.desttextures[currdesttexture]);
  },

  renderWithIDColors: function(camera, options) 
  {
    this.renderer.clearTarget(this.csgTexture);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      this.renderProductDepthAndIDColors(product, camera, this.csgTexture)
      this.mergeID(product, camera, this.csgTexture);
    }
    
    if (this.debug) {
//      showRGBTexture(scsRenderer.csgTexture, [-256,-768*window.innerHeight/window.innerWidth]);
    }
    
    this.finalRenderUsingID(camera);
  },

  /*
    Input: product and camera
    Output (target): 
    * depth: Depth buffer representing the product
    * color: ID color for each intersection or subtraction component representing the depth value    
   */
  renderProductDepthAndIDColors: function(product, camera, target) 
  {
    this.renderConvexIntersectionsID(product, camera, target);
    if (product.differences && product.differences.numObjects > 0) { // Skip if we only have positives
      this.renderConvexSubtractionsID(product, camera, target);
      this.renderClipZBufferID(product, camera, target);
    }
  },

  /*!
    Renders the intersections of a product into the given target.

    Output (target):
    * Will clear target first
    * depth: Depth buffer representing the intersections
    * color: ID color for each intersection component representing the depth value    
  */
  renderConvexIntersectionsID: function (product, camera, target) {
    product.intersections.overrideMaterial = this.idColorMaterial;
    //	
    // a) Draw the furthest front facing surface into z-buffer, render ID color into color buffer
    //
    this.gl.depthFunc(this.gl.GREATER);
    this.gl.clearDepth(0.0);
    this.renderer.clearTarget(target, true, true, true);
    this.renderer.render(product.intersections, camera, target);
    this.gl.clearDepth(1.0);

    // Optimization: We we've got only one intersection, there is no need to perform clipping
    if (product.intersections.numObjects > 1) {
      //	
      // b) Count the number of back-facing surfaces behind each pixel.
      // 
      // Count in stencil buffer, don't draw to depth or color buffers
      this.gl.depthMask(false);
      this.gl.colorMask(false,false,false,false);
      this.gl.cullFace(this.gl.FRONT);
      this.gl.enable(this.gl.STENCIL_TEST);
      this.gl.stencilFunc(this.gl.ALWAYS,0,-1);
      this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.INCR);
      
      this.renderer.render(product.intersections, camera, target);
      this.gl.cullFace(this.gl.BACK);
      
      //
      // c) Reset the z-buffer and color buffer for pixels where stencil != n
      // FIXME: Also, reset stencil to zero?
      // 
      this.gl.depthMask(true);
      this.gl.colorMask(true,true,true,true);
      this.gl.depthFunc(this.gl.ALWAYS);
      this.gl.stencilFunc(this.gl.NOTEQUAL,product.intersections.numObjects,-1);
      this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
      this.renderer.render(this.clipScene, this.quadCamera, target);
      
      this.gl.disable(this.gl.STENCIL_TEST);
      this.gl.colorMask(true, true, true, true);
    }

    this.gl.depthFunc(this.gl.LEQUAL);

    delete product.intersections.overrideMaterial;
  },
  
  /*!
    Renders the subtractions of a product into the given target.

    Output (target):
    * depth: Depth buffer representing the subtractions
    * color: ID color for each intersection component representing the depth value    
  */
  renderConvexSubtractionsID: function (product, camera, target)
  {
    product.differences.overrideMaterial = this.idColorMaterial;
    
    this.renderer.clearTarget(target, false, false, true);
    
    this.renderer.setRenderTarget(target); // To get correct stencil bits
    var stencilBits = this.gl.getParameter(this.gl.STENCIL_BITS);
    var stencilMask = (1 << stencilBits) - 1;
    var stencilCode = 0;
    
//    console.log("renderConvexSubtractions: " + stencilBits + " stencil bits");
    
    // a) Mark all front facing fragments - this is where negative parts can show through
    this.gl.enable(this.gl.STENCIL_TEST);
    
    var difference_objects = product.differences.children[0].children;
    difference_objects.forEach(function(obj) { obj.visible = false; });
    
    // This creates a worst-case (N^2) subtraction sequence
    // Optimizations:
    // o Batch primitives which don't overlap in screen-space
    for (var j=0;j<difference_objects.length;j++) 
      for (var i=0;i<difference_objects.length;i++) {
        difference_objects[i].visible = true;
        
        stencilCode++;
        
        this.gl.depthMask(false);
        this.gl.colorMask(false,false,false,false);
        this.gl.stencilFunc(this.gl.ALWAYS, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.REPLACE);
        this.renderer.render(product.differences, camera, target);
        
        // b) Render back faces clipped against marked area
        this.gl.cullFace(this.gl.FRONT);
        this.gl.depthFunc(this.gl.GEQUAL);
        this.gl.depthMask(true);
        this.gl.colorMask(true,true,true,true);
        this.gl.stencilFunc(this.gl.EQUAL, stencilCode, -1);
        this.gl.stencilOp(this.gl.KEEP, this.gl.KEEP, this.gl.KEEP);
        this.renderer.render(product.differences, camera, target);
        
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.cullFace(this.gl.BACK);
        
        difference_objects[i].visible = false;
      }
    difference_objects.forEach(function(obj) { obj.visible = true; });
    
    this.gl.disable(this.gl.STENCIL_TEST);
    delete product.differences.overrideMaterial;
  },

  /*
    Determines where a subtraction would allow us to see through the object, and resets the
    color and depth buffer for these areas.
   */
  renderClipZBufferID: function (product, camera, target)
  {
    // FIXME: Do we need to render this when we have no subtractions?

    product.intersections.overrideMaterial = this.scsPassMaterial;
    
    //
    // a) Mark areas where we can see the backfaces
    // 
    this.gl.colorMask(false,false,false,false);
    this.gl.depthMask(false);
    this.gl.cullFace(this.gl.FRONT);
    this.gl.depthFunc(this.gl.LESS);
    this.gl.enable(this.gl.STENCIL_TEST);
    this.gl.stencilFunc(this.gl.ALWAYS,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.REPLACE);
    
    this.renderer.clearTarget(target, false, false, true);
    // Draw all intersected objects
    this.renderer.render(product.intersections, camera, target);
    
    // 
    // b) Reset see-through pixels
    // 
    this.gl.depthMask(true);
    this.gl.colorMask(true,true,true,true);
    this.gl.depthFunc(this.gl.ALWAYS);
    this.gl.cullFace(this.gl.BACK);
    this.gl.stencilFunc(this.gl.EQUAL,1,-1);
    this.gl.stencilOp(this.gl.KEEP,this.gl.KEEP,this.gl.KEEP);
    this.renderer.render(this.clipScene, this.quadCamera, target);
    
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
    delete product.intersections.overrideMaterial;
  },

  /*
    Assumes the current color and depth framebuffer contains the current ID color and depth
    values of all products processed thus far.
    The texture contains ID colors of the given product

    Re-renders the entire product, but only transfer depth values where the product ID matches
    the ID in the texture color buffer.
  */
  mergeID: function(product, camera, texture) {
    this.renderer.setRenderTarget(null); // Render to screen
    this.idMergeMaterial.uniforms.idtexture.value = texture;
    this.idMergeMaterial.uniforms.screenSize.value = [this.size.width, this.size.height];
    product.intersections.overrideMaterial = this.idMergeMaterial;
    product.differences.overrideMaterial = this.idMergeMaterial;
    this.renderer.render(product.intersections, camera);
    this.gl.cullFace(this.gl.FRONT);
    this.renderer.render(product.differences, camera);
    this.gl.cullFace(this.gl.BACK);
    delete product.intersections.overrideMaterial;
    delete product.differences.overrideMaterial;
  },

  /*
    Assumes a correct Z buffer for all products exists in the framebuffer.
    
    Renders all products (intersection front faces and subtraction back faces) with their
    normal materials and shaders, but with EQUAL depth test.
   */
  finalRenderUsingID: function(camera) {
    this.renderer.setRenderTarget(null); // Render to screen
    
    this.gl.depthFunc(this.gl.EQUAL);
    for (var i=0;i<this.products.length;i++) {
      var product = this.products[i];
      this.renderer.render(product.intersections, camera);
      if (product.differences) {
        this.gl.cullFace(this.gl.FRONT);
        this.renderer.render(product.differences, camera);
        this.gl.cullFace(this.gl.BACK);
      }
    }
    this.gl.depthFunc(this.gl.LESS);
  },


  setDebug: function(debugflag) {
    this.debug = debugflag;
  },

  // FIXME: For visual debugging, we're using real colors
  // To support more objects, we should generate this as increasing ID's
  // or find another way of generating lots of unique color values
  colors: [
    0xff0000,
    0x00ff00,
    0x0000ff,
    0xffff00,
    0xff0fff,
    0x00ffff,
    0x880000,
    0x008800,
    0x000088,
    0x88ff00,
    0x00ff88,
    0xff8800,
    0xff0088,
    0x8800ff,
    0x0088ff
  ],

  setScene: function(csgscene) {
    var self = this;
    var objectid = 0;
    this.products = [];
    this.transparent_objects = new THREE.Scene();
    if (csgscene.transparents) {
      this.transparent_objects.add.apply(this.transparent_objects, csgscene.transparents);
      this.lights.forEach(function(light) {
        self.transparent_objects.add(light.clone());
      });
    }
    csgscene.products.forEach(function(ch) {
      var product = {};
      product.intersections = new THREE.Scene();
      if (ch.intersections && ch.intersections.length > 0) {
        product.intersections.numObjects = ch.intersections.length;
        var group = new THREE.Group();
        ch.intersections.forEach(function(obj) {
//          obj.userData.id = objectid++;
          obj.userData.id = self.colors[objectid];
          objectid = (objectid + 1) % self.colors.length;
//          obj.userData.id = Math.random() * 0xffffff;
        });
        group.add.apply(group, ch.intersections);

        product.intersections.add(group);
        self.lights.forEach(function(light) {
	  product.intersections.add(light.clone());
        });
      }

      product.differences = new THREE.Scene();
      if (ch.differences && ch.differences.length > 0) {
        product.differences.numObjects = ch.differences.length;
        var group = new THREE.Group();

        ch.differences.forEach(function(obj) {
//          obj.userData.id = objectid++;
          obj.userData.id = self.colors[objectid];
          objectid = (objectid + 1) % self.colors.length;
//          obj.userData.id = Math.random() * 0xffffff;
        });
        group.add.apply(group, ch.differences);

        product.differences.add(group);
        self.lights.forEach(function(light) {
	  product.differences.add(light.clone());
        });
      }

      self.products.push(product);
    });
  },

  render: function(camera, options) {
    options = options || {};
    this.renderWithRealZBuffer(camera, options);
  },

  setSize: function(width, height) {
    this.renderer.setSize(width, height);

    if (this.size.width != width || this.size.height != height) {
      this.size = this.renderer.getSize();
      this.setupTextureResources();
    }
  },

  addLights: function(lights) {
    this.lights = lights;
  }

};

SCSRenderer.createQuadScene = function(shader) {
  var quadMaterial = new THREE.ShaderMaterial( {
    uniforms: shader.uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader
  } );
  var quadScene = new THREE.Scene();
  var geom = new THREE.PlaneBufferGeometry( 2, 2 );
  for (var i=0;i<geom.attributes.position.array.length;i+=3) {
    geom.attributes.position.array[i+2] = 1;
  }
  quadScene.add(new THREE.Mesh( geom, quadMaterial ))
  quadScene.shaderMaterial = quadMaterial;
  return quadScene;
};

module.exports = SCSRenderer;
