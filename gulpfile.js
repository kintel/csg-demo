var gulp = require('gulp');
var bower = require('gulp-bower');
var browserSync = require('browser-sync').create();
var reload = browserSync.reload;

gulp.task('bower', function() { 
  return bower()
  .pipe(gulp.dest('public/vendor/')) 
});

gulp.task('copy', function () {
  gulp.src('./src/**/*.js')
    .pipe(gulp.dest('./public/js'));
  gulp.src('./models/**/*')
    .pipe(gulp.dest('./public/models'));
});

gulp.task('serve', ['bower', 'copy'], function () {
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
    gulp.watch(['*.html', 'csgdemo.js', 'SCSRenderer.js'], reload);
    gulp.watch(['bower.json'], ['bower'], reload);
});
