## How to set up three.js

    mkdir vendor
    cd vendor
    git clone https://github.com/kintel/three.js.git
    cd three.js
    git checkout depthtextures
    cd utils/build
    python build.py --include common --include extras
    python build.py --include common --include extras --minify --output ../../build/three.min.js

-> will build three.js/build/three.js  (which is used directly by csgdemo)
and three.js/build/three.min.js (which is used by the three.js examples)


## Setup

    bower install
