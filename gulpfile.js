var gulp = require('gulp');
var bower = require('gulp-bower');
var browserSync = require('browser-sync').create();
var reload = browserSync.reload;

gulp.task('bower', function() { 
  return bower()
  .pipe(gulp.dest('vendor/')) 
});

var debug = require('gulp-debug');
var fs = require('fs');

gulp.task('serve', ['bower'], function () {
  browserSync.init(null, {
    server: {
      baseDir: '',
    },
    startPath: 'csgdemo.html',
    debugInfo: false,
    open: true,
    hostnameSuffix: ""
  });
});

gulp.task('watch', ['serve'], function () {
    gulp.watch(['*.html', 'csgdemo.js'], reload);
    gulp.watch(['bower.json'], ['bower'], reload);
});
