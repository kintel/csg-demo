var SCSRenderer = require('./SCSRenderer');
var CSGScene = require('./CSGNodes').CSGScene;

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

var canvaswrapper;
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
	
var scsRenderer;
var controls;
var camera;
var extra_objects_scene;

window.onload = function() {
	
  document.body.style.backgroundColor = '#' + $("#bgcolor")[0].color.toString();
  canvaswrapper = document.getElementById('canvaswrapper');
  canvas = document.getElementById('canvas');

  renderer = new THREE.WebGLRenderer({canvas: canvas, alpha: true});
  gl = renderer.getContext();
  resizeCanvasToDisplaySize(true);
  var size = renderer.getSize();

  camera = new THREE.PerspectiveCamera(75, size.width / size.height, 0.5, 1000);
  camera.position.z = 50;

  controls = new THREE.TrackballControls(camera, canvaswrapper);
  controls.rotateSpeed = 3.0;
  controls.panSpeed = 2.0;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.1;
  controls.addEventListener('change', render);
  
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
  
  scsRenderer = new SCSRenderer(renderer);
  scsRenderer.addLights([pointLight, light2]);

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
vec3 col = texture2D(texture, coord).rgb;\n\
float alpha = (col == vec3(0,0,0)) ? 0.0 : 1.0;\n\
gl_FragColor.rgba = vec4(col, alpha);\n\
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
	
  texScene = SCSRenderer.createQuadScene(texshader);
  texRgbScene = SCSRenderer.createQuadScene(texrgbshader);
  alphaScene = SCSRenderer.createQuadScene(alphashader);
  depthScene = SCSRenderer.createQuadScene(depthshader);
  stencilScene = SCSRenderer.createQuadScene(stencilshader);
  quadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 1 );
  
  extra_objects_scene = createTestScene();

  settings.debug = document.getElementById('debug').checked;

  document.getElementById('renderermenu').addEventListener('change', function(event) {
    applySettings(event.target.value);
  });
  applySettings(document.getElementById('renderermenu').value);

  document.getElementById('menu').addEventListener('change', function(event) {
    loadModel(event.target.value);
  });

  document.getElementById('debug').addEventListener('change', function(event) {
    settings.debug = event.target.checked;
    render();
  });

  document.getElementById('extra_objects').addEventListener('change', function(event) {
    settings.extraObjects = event.target.checked;
    render();
  });

  window.addEventListener('resize', render);

  loadModel(document.getElementById('menu').value);

  animate();
}

function setupWindowViewport(pos, size, canvassize) {
  size = size || [256,0];
  if (!size[0]) size[0] = size[1] * canvassize.width/canvassize.height;
  if (!size[1]) size[1] = size[0] * canvassize.height/canvassize.width;
  pos = pos || [window.innerWidth - size[0], 0];
  if (pos[0] < 0) pos[0] += canvassize.width;
  if (pos[1] < 0) pos[1] += canvassize.height;
  renderer.setViewport(pos[0], pos[1], size[0], size[1]);
}

/*
 Renders the given texture without alpha in a window for debugging
*/
function showRGBTexture(texture, pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
	
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
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
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
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
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
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
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
  Clears a portion of the viewport (color only)
*/
function clearViewport(pos, size) {
  renderer.setRenderTarget(null); // Render to screen
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
  renderer.clear();

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
  var canvassize = renderer.getSize();
  var v = gl.getParameter(gl.VIEWPORT);
  setupWindowViewport(pos, size, canvassize);
  
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

function animate() {
  requestAnimationFrame(animate);
  controls.update();
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

  resizeCanvasToDisplaySize();
  var size = renderer.getSize();

  renderer.setRenderTarget(null); // Render to screen
  renderer.autoClear = false;
  setupWindowViewport([0,0], [size.width, size.height], size);
  var v = gl.getParameter(gl.VIEWPORT);
  gl.clearColor(0,0,0,0);
  renderer.clear();

  
  scsRenderer.render(camera, settings.rendering);
  
  if (settings.extraObjects) {
    renderer.render(extra_objects_scene, camera);
  }
  renderer.render(scsRenderer.transparent_objects, camera);
  
  if (settings.debug) {
    // Show texture in a window
    showRGBTexture(scsRenderer.csgTexture, [0, 512*gl.canvas.height/gl.canvas.width]);
    
    // Render depth buffer in a window for debugging
//    showDepthBuffer(scsRenderer.depthTexture, [0,0]);
//    showAlpha(scsRenderer.csgTexture, [100,0]);
    
//    showAlpha(scsRenderer.desttextures[0], [0,-256*gl.canvas.height/gl.canvas.width]);
//    showAlpha(scsRenderer.desttextures[1], [100,-256*gl.canvas.height/gl.canvas.width]);
    
    // Render stencil buffer in a window for debugging
//    showStencilBuffer(scsRenderer.csgTexture, [0,256*gl.canvas.height/gl.canvas.width]);
  }
}

function loadModel(filename) {
  var csgscene = new CSGScene();
  csgscene.load(filename, function() {
    console.log('Loaded ' + filename);
    scsRenderer.setScene(csgscene);
    render();
  });
}

function applySettings(str) {
  settings.rendering = {};
  var obj = eval("(" + str + ")");
  for (var s in obj) {
    if (obj.hasOwnProperty(s)) settings.rendering[s] = obj[s];
  }
}

function resizeCanvasToDisplaySize(force) {
  // Inherit width from parent
  var width = canvaswrapper.clientWidth;
  var height = canvaswrapper.clientHeight;
  if (force || canvas.width != width || canvas.height != height) {
    // Will update canvas size and gl.viewport
    if (scsRenderer) scsRenderer.setSize(width, height, true);
    else renderer.setSize(width, height, true);
    if (camera) {
      camera.aspect = width/height;
      camera.updateProjectionMatrix();
    }
    if (controls) {
      controls.handleResize();
    }
  }
}
