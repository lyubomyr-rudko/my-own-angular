module.exports = function (grunt) {
  grunt.initConfig({
    jshint: {
      all: ['src/**/*.js'],
      options: {
        browser: true,
        devel: true,
        globals: {
          _: false,
          $: false,
          jasmine: false,
          describe: false,
          it: false,
          expect: false,
          beforeEach: false,
          afterEach: false,
          sinon: false
        }
      }
    },
    testem: {
      unit: {
        options: {
          framework: 'jasmine2',
          launch_in_dev: ['PhantomJS'],
          before_tests: 'grunt jshint',
          serve_files: [
            'node_modules/lodash/dist/lodash.js',
            'node_modules/jquery/dist/jquery.js',
            'node_modules/sinon/pkg/sinon.js',
            'src/**/*.js',
            'test/**/*.js'
          ],
          watch_files: [
            'src/**/*.js',
            'test/**/*.js'
          ] 
        }
      } 
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-testem-mincer');

  grunt.registerTask('default', ['testem:run:unit']);
};
