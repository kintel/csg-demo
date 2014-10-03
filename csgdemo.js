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
//      float srcd = texture2D(srcdepth, coord).r;\n\
      float srcd = srcfrag.a;\n\
//      gl_FragColor = (srcd <= prevfrag.a) ? vec4(srcfrag.rgb, srcd) : prevfrag;\n\
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

SCSRenderer.prototype.renderConvexIntersections = function (product, camera, renderTarget) {
	product.intersections.overrideMaterial = this.scsPassMaterial;
//	product.intersections.overrideMaterial = new THREE.MeshNormalMaterial({ color: 0x00ffff });
	//	
  // a) Draw the furthest front facing surface into z-buffer.
	//
  gl.colorMask(false,true,false,true);
  gl.depthFunc(gl.GREATER);
  gl.disable(gl.BLEND);
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

SCSRenderer.prototype.renderClipZBuffer = function (product, camera, renderTarget)
{
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
 The z buffer should represent a merged depth buffer
*/
SCSRenderer.prototype.renderLightingUsingZBuffer = function(product, camera, renderTarget) {
	gl.depthFunc(gl.EQUAL);
  gl.colorMask(true,true,true,false);
	renderer.render(product.intersections, camera, renderTarget);
	gl.cullFace(gl.FRONT);
	renderer.render(product.differences, camera, renderTarget);
	gl.cullFace(gl.BACK);
  gl.colorMask(true,true,true,true);
  gl.depthFunc(gl.LEQUAL);
	
}

SCSRenderer.prototype.mergeBuffers = function(src, prev, dest) {

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  this.mergeScene.shaderMaterial.uniforms.src.value = src;
  this.mergeScene.shaderMaterial.uniforms.srcdepth.value = src.depthTexture;
  this.mergeScene.shaderMaterial.uniforms.prev.value = prev;
	this.renderer.render(this.mergeScene, this.quadCamera, dest);
  gl.enable(gl.DEPTH_TEST);
}

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
		gl.cullFace(gl.FRONT);
		product.differences.overrideMaterial = this.mergeObjectsMaterial;
		renderer.render(product.differences, camera);
		gl.cullFace(gl.BACK);
		delete product.intersections.overrideMaterial;
		delete product.differences.overrideMaterial;
	}
	gl.depthFunc(gl.LESS);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

SCSRenderer.prototype.render = function (camera) 
{
	for (var i=0;i<2;i++) {
    // Init alpha with 1 since we're using alpha to emulate a depth buffer
    gl.clearColor(0,0,0,1);
		renderer.clearTarget(this.desttextures[0]);
    gl.clearColor(0,0,0,0);
	}

	this.renderer.clearTarget(this.csgTexture, true, false, false);
  for (var i=0;i<this.numProducts;i++) {
		var product = this.products[i];
		this.renderConvexIntersections(product, camera, this.csgTexture);
		this.renderConvexSubtractions(product, camera, this.csgTexture);
		this.renderClipZBuffer(product, camera, this.csgTexture);
		this.renderLightingUsingZBuffer(product, camera, this.csgTexture);
		this.mergeBuffers(this.csgTexture, this.desttextures[i%2], this.desttextures[(i+1)%2]);
	}

	var currdesttexture = this.numProducts%2;
//	this.renderer.clearTarget(this.csgTexture, true, true, true);

		//  showRGBTexture(this.desttextures[1], [0,0], [window.innerWidth, window.innerHeight]);
	if (settings.debug) {
		showRGBTexture(this.desttextures[currdesttexture], [-256,-256*window.innerHeight/window.innerWidth]);
	}

	this.mergeObjectsWithTexture(this.desttextures[currdesttexture], [0,0], [window.innerWidth, window.innerHeight]);
	//	showRGBTexture(scsRenderer.csgTexture, [0,0], [window.innerWidth, window.innerHeight]);

};


function text2html(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function handleError(text) {
  var html = text2html(text);
  if (html == 'WebGL not supported') {
    html = 'Your browser does not support WebGL.<br>Please see\
    <a href="http://www.khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">\
    Getting a WebGL Implementation</a>.';
  }
  var error = document.getElementById('error');
  error.innerHTML = html;
  error.style.zIndex = 1;
}

window.onerror = handleError;

var canvas;
var renderer;
var gl;
var settings = {};
var depthshader;
var texshader;
var alphashader;
var texrgbshader;
var stencilshader;
var texScene;
var texRgbScene;
var alphaScene;
var depthScene;
var stencilScene;
var quadCamera;
	
var windowTexture;
var depthComposer;
var showDepthPass;
var scsRenderer;
var controls;
var camera;
var extra_objects_scene;

window.onload = function() {
	
	document.body.style.backgroundColor = '#' + $("#bgcolor")[0].color.toString();
  canvas = document.getElementById('canvas');
	renderer = new THREE.WebGLRenderer({canvas: canvas, alpha: true});
	gl = renderer.getContext();
	renderer.setSize(window.innerWidth, window.innerHeight);
	
	depthshader = {
    uniforms: {dtexture: {type: 't'}},
    vertexShader: '\
		varying vec2 coord;\n\
		void main() {\n\
    coord = uv.xy;\n\
    gl_Position = vec4(position.xy, 0, 1);\n\
  }\n\
		',
    fragmentShader: '\
		uniform sampler2D dtexture;\n\
		varying vec2 coord;\n\
		void main() {\n\
    float z = texture2D(dtexture, coord).r;\n\
    float n = 0.7;\n\
    float f = 1.0;\n\
    float c = (z-n)/(f-n);\n\
    gl_FragColor.rgba = vec4(vec3(1.0-c), c == 1.0 ? 0.0 : 1.0);\n\
  }\n'
	};
	
	texshader = {
    uniforms: {texture: {type: 't'}},
    vertexShader: '\
		varying vec2 coord;\n\
		void main() {\n\
    coord = uv.xy;\n\
    gl_Position = vec4(position.xy, 0, 1);\n\
  }\n\
		',
    fragmentShader: '\
		uniform sampler2D texture;\n\
		varying vec2 coord;\n\
		void main() {\n\
    gl_FragColor = texture2D(texture, coord);\n\
  }\n'
	};
	
	alphashader = {
		uniforms: {texture: {type: 't'}},
		vertexShader: '\n\
		varying vec2 coord;\n\
		void main() {\n\
    coord = uv.xy;\n\
    gl_Position = vec4(position.xy, 0, 1);\n\
  }\n',
		fragmentShader: '\n\
		uniform sampler2D texture;\n\
		varying vec2 coord;\n\
		void main() {\n\
    float z = texture2D(texture, coord).a;\n\
    float n = 0.0;\n\
    float f = 1.0;\n\
    float c = (z-n)/(f-n);\n\
    gl_FragColor.rgba = vec4(vec3(1.0-c), c == 1.0 ? 0.0 : 1.0);\n\
  }\n'
	};
	
	texrgbshader = {
		uniforms: {texture: {type: 't'}},
		vertexShader: '\n\
		varying vec2 coord;\n\
		void main() {\n\
    coord = uv.xy;\n\
    gl_Position = vec4(position.xy, 0, 1);\n\
  }\n',
		fragmentShader: '\n\
		uniform sampler2D texture;\n\
		varying vec2 coord;\n\
		void main() {\n\
    gl_FragColor.rgb = texture2D(texture, coord).rgb;\n\
  }\n'
	};
	
	stencilshader = {
		uniforms: {col: {type: '3f'}},
		vertexShader: '\n\
		uniform vec3 col;\n\
		void main() {\n\
    gl_Position = vec4(position.xy, 0, 1);\n\
  }\n\
		',
		fragmentShader: '\n\
		uniform vec3 col;\n\
		void main() {\n\
    gl_FragColor = vec4(col, 1);\n\
  }\n\
		'};
	
	texScene = createQuadScene(texshader);
	texRgbScene = createQuadScene(texrgbshader);
	alphaScene = createQuadScene(alphashader);
	depthScene = createQuadScene(depthshader);
	stencilScene = createQuadScene(stencilshader);
	quadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
	
	windowTexture = new THREE.WebGLRenderTarget(256, 256*window.innerHeight/window.innerWidth, {
		minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter});
	depthComposer = new THREE.EffectComposer(renderer, windowTexture);
	showDepthPass = new THREE.ShaderPass(depthshader);
	showDepthPass.renderToScreen = true;
	showDepthPass.needsSwap = false;
	depthComposer.addPass(showDepthPass);
	
	//var mainscene = createScene();
	//var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 100);
	//setup(mainscene, camera);
	extra_objects_scene = createTestScene();

	loadModel(document.getElementById('menu').value);
}

function createQuadScene(shader) {
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
}

function loaderFinished(result) {
	var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 1000);

//	var mainscene = createScene();
//	setup(mainscene, camera);
	setup(result.scene, camera);
}

function createScene() {

	// create a point light
	var pointLight = new THREE.PointLight(0xFFFFFF);
	pointLight.position.x = 10;
	pointLight.position.y = 50;
	pointLight.position.z = 130;

	var product = {};
	product.intersections = [];
	product.differences = [];
	product.intersections[0] = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), material);
	product.intersections[1] = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 16), material);
	product.differences[0] = new THREE.Mesh(new THREE.BoxGeometry(1,1,4), material);
	products.push(product);
	
	// Create separate scenes for intersections and differences
	//	products.forEach(function (product) {
	var scene = new THREE.Scene();

	var productnode = new THREE.Object3D();
	
	var intersections = new THREE.Object3D();
	product.intersections.forEach(function(intersection) {
		intersections.add(intersection);
	});
	intersections.numObjects = product.intersections.length;
	productnode.add(intersections);

	var differences = new THREE.Object3D();
	product.differences.forEach(function(difference) {
		differences.add(difference);
	});
	differences.numObjects = product.differences.length;
	productnode.add(differences);

	scene.add(productnode);

	scene.add(pointLight.clone());
//	});

	return scene;
}

function setup(mainscene, maincamera) {

	// create a point light
	var pointLight = new THREE.PointLight(0xFFFFFF);
	pointLight.position.x = 10;
	pointLight.position.y = 50;
	pointLight.position.z = 130;

	var light2 = new THREE.DirectionalLight(0xFFFFFF);
	light2.position.x = 100;
	light2.position.y = -50;
	light2.position.z = -130;
	light2.target.x = 0;
	light2.target.y = 0;
	light2.target.z = 0;

	camera = maincamera;
	controls = new THREE.TrackballControls(camera, canvas);
	controls.rotateSpeed = 3.0;
	controls.panSpeed = 2.0;
	controls.staticMoving = true;
	controls.dynamicDampingFactor = 0.1;

	THREEx.WindowResize(renderer, camera);
	camera.position.z = 50;
	
	scsRenderer = new SCSRenderer(renderer, mainscene, [pointLight, light2]);

	animate();
	controls.addEventListener('change', render);
}

function setupWindowViewport(pos, size) {
  size = size || [256,0];
  if (!size[0]) size[0] = size[1] * window.innerWidth/window.innerHeight;
  if (!size[1]) size[1] = size[0] * window.innerHeight/window.innerWidth;
  pos = pos || [window.innerWidth - size[0], 0];
  if (pos[0] < 0) pos[0] += window.innerWidth;
  if (pos[1] < 0) pos[1] += window.innerHeight;
	renderer.setViewport(pos[0], pos[1], size[0], size[1]);
}

/*
 Renders the given texture without alpha in a window for debugging
*/
function showRGBTexture(texture, pos, size) {
	renderer.setRenderTarget(null); // Render to screen
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size);
	
  gl.disable(gl.DEPTH_TEST);
	
  texRgbScene.shaderMaterial.uniforms.texture.value = texture;
	renderer.render(texRgbScene, quadCamera);
	
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*
 Renders the given texture in a window for debugging
*/
function showTexture(texture, pos, size) {
	renderer.setRenderTarget(null); // Render to screen
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size);
	
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
  texScene.shaderMaterial.uniforms.texture.value = texture;
	renderer.render(texScene, quadCamera);
	
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*!
 Renders the alpha component of the given texture as visible pixels for debugging.
*/
function showAlpha(texture, pos, size) {
	renderer.setRenderTarget(null); // Render to screen
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size);
	
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
	
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  alphaScene.shaderMaterial.uniforms.texture.value = texture;
	renderer.render(alphaScene, quadCamera);
  gl.disable(gl.BLEND);
	
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*!
 Renders the depth buffer of the given texture in a window for debugging.
 Znear is white, Zfar is black
*/
function showDepthBuffer(texture, pos, size) {
	renderer.setRenderTarget(null); // Render to screen
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size);

  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
	depthScene.shaderMaterial.uniforms.dtexture.value = texture;
  renderer.render(depthScene, quadCamera);
	
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  gl.viewport(v[0], v[1], v[2], v[3]);
}

/*!
 Renders the stencil buffer of the given render target in a window for debugging.
 The render target must have a depth attachment.
 Each stencil bit is rendered in a different color.
 The render target's color buffer will be overwritten
*/
function showStencilBuffer(target, pos, size) {
	renderer.setRenderTarget(null); // Render to screen
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size);

  var colors = [[1,0,0],[0,1,0],[0,0,1],[1,1,0]];

  gl.depthMask(false);
  renderer.clearTarget(target, true, true, false);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  for (var i=0;i<colors.length;i++) {
    gl.stencilFunc(gl.EQUAL, i+1, -1);
    stencilScene.shaderMaterial.uniforms.col.value = colors[i%colors.length];
		renderer.render(stencilScene, quadCamera, target);
  }
	
  gl.disable(gl.STENCIL_TEST);
	gl.depthMask(true);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	texScene.shaderMaterial.uniforms.texture.value = target;
  renderer.render(texScene, quadCamera);

  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);

  gl.viewport(v[0], v[1], v[2], v[3]);
}

function onWindowResize() {
    controls.handleResize();
    render();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
	render();
}

function createTestScene() {
	var scene = new THREE.Scene;
	var pointLight = new THREE.PointLight(0xFFFFFF);
	pointLight.position.x = 10;
	pointLight.position.y = 50;
	pointLight.position.z = 130;
	scene.add(pointLight);
	var material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
	var boxmesh = new THREE.Mesh(new THREE.BoxGeometry(100,7,7), material);
	boxmesh.translateX(15);
	boxmesh.translateY(15);
	scene.add(boxmesh);
	return scene;
}

function render() {

	renderer.setRenderTarget(null); // Render to screen
  renderer.autoClear = false;
	setupWindowViewport([0,0], [window.innerWidth, window.innerHeight]);
  var v = gl.getParameter(gl.VIEWPORT);
	gl.clearColor(0.0,0,0,0);
	renderer.clear();

  scsRenderer.render(camera);

	if (settings.extraObjects) {
		renderer.render(extra_objects_scene, camera);
	}
	renderer.render(scsRenderer.transparent_objects, camera);

	if (settings.debug) {
		// Show texture in a window
		showRGBTexture(scsRenderer.csgTexture, [0, 512*gl.canvas.height/gl.canvas.width]);
		
		// Render depth buffer in a window for debugging
		showDepthBuffer(scsRenderer.depthTexture, [0,0]);
		showAlpha(scsRenderer.csgTexture, [100,0]);
		
		showAlpha(scsRenderer.desttextures[0], [0,-256*gl.canvas.height/gl.canvas.width]);
		showAlpha(scsRenderer.desttextures[1], [100,-256*gl.canvas.height/gl.canvas.width]);
		
		// Render stencil buffer in a window for debugging
		showStencilBuffer(scsRenderer.csgTexture, [0,256*gl.canvas.height/gl.canvas.width]);
	}
}

function loadModel(filename) {
	console.log('loading ' + filename + '...');
	var loader = new THREE.SceneLoader();
	loader.load(filename, loaderFinished);
}
