var gulp = require('gulp');
var bower = require('gulp-bower');
var browserSync = require('browser-sync').create();
var reload = browserSync.reload;

gulp.task('bower', function() { 
  return bower()
  .pipe(gulp.dest('public/vendor/')) 
});

gulp.task('copy', function () {
  gulp.src('./models/**/*')
    .pipe(gulp.dest('./public/models'));
});

var browserify = require('browserify');
var globby = require('globby');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
gulp.task('browserify', function() {
  globby(['./src/**/*.js']).then(function(entries) {
    var b = browserify(entries);
    b.bundle()
      .on('error', function(err) {
        // print the error (can replace with gulp-util)
        console.log(err);
        // end this stream
        this.emit('end');
      })
      .pipe(source('app.js'))
      .pipe(buffer())
      .pipe(gulp.dest('public/js'));
  });
});

gulp.task('serve', ['bower', 'browserify', 'copy'], function () {
  browserSync.init(null, {
    server: {
      baseDir: 'public',
    },
    startPath: 'csgdemo.html',
    debugInfo: false,
    open: true,
    hostnameSuffix: ""
  });
});

gulp.task('watch', ['serve'], function () {
    gulp.watch(['public/*.html'], reload);
    gulp.watch(['src/**/*.js'], ['browserify'], reload);
    gulp.watch(['models/**/*'], ['copy'], reload);
    gulp.watch(['bower.json'], ['copy'], reload);
});
