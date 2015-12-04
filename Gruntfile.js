'use strict';

module.exports = function (grunt) {
  require('jit-grunt')(grunt, {});

  grunt.initConfig({
    jshint: {
      options: {
        jshintrc: '.jshintrc',
        reporter: require('jshint-stylish')
      },
      all: {
        src: [
          'lib/*.js',
          'example/*.js',
          'example/db/**/*.js'
        ]
      }
    },

    mochaTest: {
      options: {
        reporter: 'spec'
      },
      src: ['lib/*.spec.js']
    },

    watch: {
      gruntfile: {
        files: ['Gruntfile.js']
      },
      mochaTest: {
        files: ['lib/*.js'],
        tasks: ['mochaTest']
      }
    }
  });

  grunt.registerTask('test', ['mochaTest']);

  grunt.registerTask('default', [
    'newer:jshint',
    'test'
  ]);
};
